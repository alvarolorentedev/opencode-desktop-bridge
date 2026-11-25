"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { createBridge } = require("../src/core/bridge.js")
const { createDeviceStore } = require("../src/core/devices.js")
const { listen, close, createUpstream, request, basic } = require("./helpers.js")

function waitFor(predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - started > timeout) return reject(new Error("Timed out waiting for condition"))
      setTimeout(tick, 20)
    }
    tick()
  })
}

function openSse(port, token, frames) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: "/api/event", headers: { authorization: basic(token), accept: "text/event-stream" } },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`SSE failed with ${res.statusCode}`))
          return
        }
        let buffer = ""
        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8")
          for (;;) {
            const index = buffer.indexOf("\n\n")
            if (index < 0) break
            const frame = buffer.slice(0, index)
            buffer = buffer.slice(index + 2)
            if (frame.trim()) frames.push(frame)
          }
        })
        resolve({ req, res, close: () => req.destroy() })
      },
    )
    req.on("error", reject)
    req.end()
  })
}

test("bridge aggregates, routes, pairs and survives registry changes", async (t) => {
  const upstreamA = createUpstream("a")
  const upstreamB = createUpstream("b")
  const portA = await listen(upstreamA.server)
  const portB = await listen(upstreamB.server)
  const endpoints = {
    a: { url: `http://127.0.0.1:${portA}`, headers: { authorization: "Basic dXBzdHJlYW0=" } },
    b: { url: `http://127.0.0.1:${portB}`, headers: { authorization: "Basic dXBzdHJlYW0=" } },
  }
  let exposed = ["a", "b"]
  let stored = []
  let redeemed = false
  const devices = createDeviceStore({ load: () => stored, save: (next) => (stored = next) })
  let bridge
  bridge = createBridge({
    resolveServer: (id) => endpoints[id],
    servers: () => exposed.map((id) => ({ id, name: id.toUpperCase(), connected: true, builtin: id === "a", local: false })),
    configServer: () => "a",
    redeem: async (code) => {
      if (code !== "good" || redeemed) return false
      redeemed = true
      return true
    },
    devices,
    appVersion: "2.4.1",
    baseUrl: () => `http://127.0.0.1:${bridge.port}`,
    log: () => {},
  })
  await bridge.start({ host: "127.0.0.1", port: 0 })
  t.after(async () => {
    await bridge.stop()
    await close(upstreamA.server)
    await close(upstreamB.server)
  })

  const unauth = await request(bridge.port, "/api/info")
  assert.equal(unauth.status, 401)

  const paired = await request(bridge.port, "/auth/connect/good")
  assert.equal(paired.status, 200)
  assert.match(paired.body.token, /^brg1_/)
  const auth = { authorization: basic(paired.body.token) }

  const reused = await request(bridge.port, "/auth/connect/good")
  assert.equal(reused.status, 401)

  const info = await request(bridge.port, "/api/info", { headers: auth })
  assert.equal(info.status, 200)
  assert.equal(info.body.version, "2.4.1")
  assert.equal(info.body.pid, 0)
  assert.deepEqual(info.body.urls, [`http://127.0.0.1:${bridge.port}`])
  assert.equal(info.body.hostname, undefined)

  const health = await request(bridge.port, "/api/health", { headers: auth })
  assert.deepEqual(health.body, { healthy: true, version: "2.4.1" })

  const projects = await request(bridge.port, "/api/project", { headers: auth })
  assert.equal(projects.status, 200)
  assert.deepEqual(projects.body.map((project) => project.id), ["pa", "pb"])

  const sessions = await request(bridge.port, "/api/session", { headers: auth })
  assert.equal(sessions.status, 200)
  assert.deepEqual(sessions.body.data.map((session) => session.id), ["a-s1", "a-s2", "b-s1", "b-s2"])
  assert.ok(sessions.body.cursor)

  const messageA = await request(bridge.port, "/api/session/a-s1/message", { headers: auth })
  assert.equal(messageA.body.data[0].owner, "a")
  const messageB = await request(bridge.port, "/api/session/b-s1/message", { headers: auth })
  assert.equal(messageB.body.data[0].owner, "b")

  const config = await request(bridge.port, "/api/config", { headers: auth })
  assert.equal(config.body.name, "a")

  const queryToken = Buffer.from(`opencode:${paired.body.token}`).toString("base64")
  const configViaQuery = await request(bridge.port, `/api/config?auth_token=${encodeURIComponent(queryToken)}`)
  assert.equal(configViaQuery.status, 200)
  assert.equal(upstreamA.calls.filter((call) => call.path === "/api/config").every((call) => !call.search.includes("auth_token")), true)

  const locationB = await request(bridge.port, "/api/location?location%5Bdirectory%5D=%2Fb", { headers: auth })
  assert.equal(locationB.body.data.project.id, "pb")

  const created = await request(bridge.port, "/api/session", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ location: { directory: "/b" } }),
  })
  assert.equal(created.status, 200)
  assert.equal(created.body.data.id, "new-b")
  const createdMessage = await request(bridge.port, "/api/session/new-b/message", { headers: auth })
  assert.equal(createdMessage.body.data[0].owner, "b")

  assert.deepEqual(projects.body.map((project) => project.name), ["A · Project a", "B · Project b"])
  assert.equal(sessions.body.data[0].title, "A · a one")

  const directorySessions = await request(bridge.port, "/api/session?location%5Bdirectory%5D=%2Fa", { headers: auth })
  assert.equal(directorySessions.status, 200)
  assert.equal(directorySessions.body.data[0].title, "A · a one")

  const oneSession = await request(bridge.port, "/api/session/a-s1", { headers: auth })
  assert.equal(oneSession.body.data.title, "A · a one")

  const renamed = await request(bridge.port, "/api/session/a-s1", {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ title: "A · Renamed" }),
  })
  assert.equal(renamed.status, 200)
  assert.equal(renamed.body.data.title, "A · Renamed")
  assert.equal(upstreamA.sessions.get("a-s1").title, "Renamed")

  const fsRoot = await request(bridge.port, "/api/fs/list?path=%2F", { headers: auth })
  assert.deepEqual(fsRoot.body.data.map((entry) => entry.path), ["@A", "@B"])

  const fsSeeded = await request(bridge.port, "/api/fs/list?location%5Bdirectory%5D=%2Fa&path=%2Fa", { headers: auth })
  assert.deepEqual(fsSeeded.body.data.map((entry) => entry.path), ["@A", "@B"])

  const fsServerRoot = await request(bridge.port, "/api/fs/list?path=%2F%40B", { headers: auth })
  assert.deepEqual(fsServerRoot.body.data.map((entry) => entry.path), ["b-child", "b.txt"])
  assert.ok(upstreamB.calls.some((call) => call.path === "/api/fs/list" && call.search.includes("path=%2F")))

  const fsDeep = await request(bridge.port, "/api/fs/list?path=%2F%40B%2Fopt", { headers: auth })
  assert.deepEqual(fsDeep.body.data.map((entry) => entry.path), ["b-child", "b.txt"])
  assert.ok(upstreamB.calls.some((call) => call.path === "/api/fs/list" && call.search.includes("path=%2Fopt")))

  const fsReal = await request(bridge.port, "/api/fs/list?path=%2Fa", { headers: auth })
  assert.deepEqual(fsReal.body.data.map((entry) => entry.path), ["a-child", "a.txt", "@A", "@B"])

  const virtualLocation = await request(bridge.port, "/api/location?location%5Bdirectory%5D=%2F%40B%2Fopt", { headers: auth })
  assert.equal(virtualLocation.status, 200)
  assert.equal(virtualLocation.body.data.directory, "/opt")
  const createdOpt = await request(bridge.port, "/api/session", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ location: { directory: "/opt" } }),
  })
  assert.equal(createdOpt.body.data.id, "new-b")

  const active = await request(bridge.port, "/api/session/active", { headers: auth })
  assert.deepEqual(active.body, { data: { "a-s1": "busy", "b-s1": "busy" } })

  const permissions = await request(bridge.port, "/api/permission/request", { headers: auth })
  assert.deepEqual(permissions.body.data.map((item) => item.id), ["perm-a", "perm-b"])

  const forms = await request(bridge.port, "/api/form", { headers: auth })
  assert.deepEqual(forms.body.data.map((item) => item.id), ["form-a", "form-b"])

  const ptys = await request(bridge.port, "/api/pty", { headers: auth })
  assert.deepEqual(ptys.body.data.map((item) => item.id), ["pty-a", "pty-b"])
  await request(bridge.port, "/api/pty/pty-b", { headers: auth })
  assert.ok(upstreamB.calls.some((call) => call.path === "/api/pty/pty-b"))

  assert.ok(upstreamA.calls.some((call) => call.authorization === "Basic dXBzdHJlYW0="))

  const frames = []
  const sse = await openSse(bridge.port, paired.body.token, frames)
  t.after(() => sse.close())
  await waitFor(() => frames.some((frame) => frame.includes("session.status") && frame.includes("s-a")))
  await waitFor(() => frames.some((frame) => frame.includes("session.status") && frame.includes("s-b")))

  exposed = ["b"]
  bridge.notifyChanged()
  await waitFor(() => frames.filter((frame) => frame.includes("server.connected")).length >= 2)
  const afterRemoval = await request(bridge.port, "/api/project", { headers: auth })
  assert.deepEqual(afterRemoval.body.map((project) => project.id), ["pb"])
  const gone = await request(bridge.port, "/api/session/a-s1/message", { headers: auth })
  assert.equal(gone.status, 404)

  exposed = ["a", "b"]
  bridge.notifyChanged()
  const restored = await request(bridge.port, "/api/project", { headers: auth })
  assert.deepEqual(restored.body.map((project) => project.id), ["pa", "pb"])

  const capabilities = await request(bridge.port, "/bridge/v1/capabilities", { headers: auth })
  assert.equal(capabilities.body.bridge, 1)
  assert.equal(capabilities.body.servers, 2)

  bridge.revokeDevice(devices.list()[0].id)
  const revoked = await request(bridge.port, "/api/info", { headers: auth })
  assert.equal(revoked.status, 401)
})
