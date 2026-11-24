"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { createControlPlane } = require("../src/core/control.js")
const { listen, close, request } = require("./helpers.js")

test("the control plane manages TUI and web sources", async (t) => {
  const sources = { tui: [], web: [] }
  let changes = 0
  const control = createControlPlane({
    adminToken: () => "adm_test",
    readSource: (id) => sources[id] || [],
    writeSource: (id, list) => {
      sources[id] = list
    },
    snapshot: () => [
      { id: "a", name: "A", source: "desktop", exposed: true, configServer: true, connected: true },
      ...sources.tui.map((server) => ({
        id: server.id,
        name: server.name,
        source: "tui",
        exposed: true,
        configServer: false,
        connected: true,
      })),
    ],
    pair: async () => ({ link: "http://bridge.test/auth/connect/x", expiresAt: 123 }),
    baseUrl: () => "http://bridge.test",
    version: "0.1.0",
    onChange: () => {
      changes += 1
    },
  })
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://bridge.invalid")
    void control.handle(req, res, url.pathname, url.searchParams)
  })
  const port = await listen(server)
  t.after(() => close(server))

  const admin = { authorization: "Bearer adm_test" }
  const denied = await request(port, "/bridge/v1/admin/status")
  assert.equal(denied.status, 401)

  const preflight = await request(port, "/bridge/v1/admin/status", {
    method: "OPTIONS",
    headers: { origin: "https://web.test", "access-control-request-method": "GET" },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers["access-control-allow-origin"], "https://web.test")

  const status = await request(port, "/bridge/v1/admin/status", { headers: admin })
  assert.equal(status.status, 200)
  assert.equal(status.body.baseUrl, "http://bridge.test")
  assert.equal(status.body.sources.find((source) => source.id === "tui").count, 0)

  const replaced = await request(port, "/bridge/v1/admin/servers/tui", {
    method: "PUT",
    headers: { ...admin, origin: "https://web.test" },
    body: JSON.stringify({ servers: [{ name: "B", url: "http://b.test/", password: "pw" }] }),
  })
  assert.equal(replaced.status, 200)
  assert.equal(replaced.body.data.length, 1)
  assert.match(replaced.body.data[0].id, /^tui:/)
  assert.equal(replaced.body.data[0].hasPassword, true)
  assert.equal(replaced.headers["access-control-allow-origin"], "https://web.test")
  assert.equal(changes, 1)
  assert.equal(sources.tui[0].url, "http://b.test")

  const added = await request(port, "/bridge/v1/admin/servers/tui", {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ name: "C", url: "http://c.test" }),
  })
  assert.equal(added.status, 200)
  assert.equal(added.body.data.length, 2)

  const list = await request(port, "/bridge/v1/admin/sources/tui", { headers: admin })
  assert.equal(list.status, 200)
  assert.equal(list.body.data.length, 2)

  const removed = await request(port, `/bridge/v1/admin/servers/tui/${encodeURIComponent(replaced.body.data[0].id)}`, {
    method: "DELETE",
    headers: admin,
  })
  assert.equal(removed.status, 200)
  assert.equal(removed.body.data.length, 1)

  const pair = await request(port, "/bridge/v1/admin/pair", { method: "POST", headers: admin })
  assert.equal(pair.status, 200)
  assert.equal(pair.body.link, "http://bridge.test/auth/connect/x")

  const unknown = await request(port, "/bridge/v1/admin/servers/nope", {
    method: "PUT",
    headers: admin,
    body: JSON.stringify({ servers: [] }),
  })
  assert.equal(unknown.status, 404)

  const invalid = await request(port, "/bridge/v1/admin/servers/tui", {
    method: "PUT",
    headers: admin,
    body: JSON.stringify({ servers: [{ name: "Bad", url: "ftp://bad.test" }] }),
  })
  assert.equal(invalid.status, 400)

  const self = await request(port, "/bridge/v1/admin/servers/tui", {
    method: "PUT",
    headers: admin,
    body: JSON.stringify({ servers: [{ name: "Self", url: "http://bridge.test" }] }),
  })
  assert.equal(self.status, 400)
})
