"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")
const net = require("node:net")
const path = require("node:path")
const { listen, close, createUpstream, request, basic } = require("./helpers.js")

function waitFor(predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = async () => {
      try {
        if (await predicate()) return resolve()
      } catch {
        // Retry while startup settles.
      }
      if (Date.now() - started > timeout) return reject(new Error("Timed out waiting for condition"))
      setTimeout(tick, 25)
    }
    tick()
  })
}

test("the plugin main entry starts, pairs through the native sidecar, and stops", async (t) => {
  execFileSync(process.execPath, [path.join("scripts", "build.mjs")], { cwd: path.join(__dirname, "..") })
  const code = readFileSync(path.join(__dirname, "..", "dist", "gui-experimental.cjs"), "utf8")
  const schema = new Proxy(function schema() {}, { get: () => () => undefined })
  const provide = (name) => {
    if (name === "@opencode/plugin/gui") {
      return { Plugin: { define: (value) => value }, Ipc: { define: (value) => value }, Store: { global: (_schema, initial) => initial } }
    }
    if (name === "effect") return { Schema: schema }
    if (name === "solid-js") {
      return { createComponent: () => undefined, createEffect: () => {}, onCleanup: () => {} }
    }
    return require(name)
  }
  const module = { exports: {} }
  new Function("require", "module", "exports", code)(provide, module, module.exports)
  const definition = module.exports.default || module.exports

  const upstream = createUpstream("a")
  const upstreamPort = await listen(upstream.server)
  const upstreamB = createUpstream("b")
  const upstreamBPort = await listen(upstreamB.server)
  const probe = net.createServer()
  const probePort = await listen(probe)
  await close(probe)

  const configStore = {
    value: { enabled: true, host: "127.0.0.1", port: probePort, publicUrl: "", hiddenServers: [], configServer: "sidecar", remoteEnabled: false, remoteRoute: "" },
    set(value) {
      this.value = value
    },
  }
  const deviceStore = { value: [], set(value) { this.value = value } }
  const sourcesStore = { value: { tui: [], web: [] }, set(value) { this.value = value } }
  const adminStore = { value: { token: "adm_test" }, set(value) { this.value = value } }
  const stores = { config: configStore, devices: deviceStore, sources: sourcesStore, admin: adminStore }
  const cleanups = []
  let provided
  const ctx = {
    storage: { store: (key) => stores[key] },
    serverEndpoints: {
      get: (id) =>
        id === "sidecar" || id === "a"
          ? { url: `http://127.0.0.1:${upstreamPort}`, headers: { authorization: "Basic dXBzdHJlYW0=" } }
          : undefined,
    },
    app: { version: "2.4.1" },
    log: { write: () => {} },
    windows: { on: () => () => {} },
    onCleanup: (fn) => cleanups.push(fn),
    provide: (_token, impl) => {
      provided = impl
    },
  }
  t.after(async () => {
    for (const cleanup of cleanups) await cleanup()
    await close(upstream.server)
    await close(upstreamB.server)
  })

  definition.main(ctx)
  await waitFor(async () => (await provided.snapshot()).status.state === "running")

  provided.reportServers([{ id: "a", name: "A", connected: true, builtin: false, local: false }], { window: 1 })
  await waitFor(async () => (await provided.snapshot()).servers.length === 1)
  const before = await provided.snapshot()
  assert.equal(before.status.port, probePort)
  assert.equal(before.servers[0].exposed, true)
  assert.equal(before.servers[0].source, "desktop")
  assert.equal(before.sidecarReady, true)
  assert.equal(before.adminToken, "adm_test")

  const admin = { authorization: "Bearer adm_test" }
  const denied = await request(probePort, "/bridge/v1/admin/status")
  assert.equal(denied.status, 401)
  const remoteAdmin = await request(probePort, "/bridge/v1/admin/status", {
    headers: { ...admin, host: "bridge-test.tunnel.test" },
  })
  assert.equal(remoteAdmin.status, 403)
  const preflight = await request(probePort, "/bridge/v1/admin/status", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:49374", "access-control-request-method": "GET" },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:49374")

  const added = await request(probePort, "/bridge/v1/admin/servers/tui", {
    method: "PUT",
    headers: admin,
    body: JSON.stringify({ servers: [{ name: "B", url: `http://127.0.0.1:${upstreamBPort}`, password: "secret" }] }),
  })
  assert.equal(added.status, 200)
  assert.equal(added.body.data.length, 1)
  assert.equal(added.body.data[0].hasPassword, true)

  const controlStatus = await request(probePort, "/bridge/v1/admin/status", { headers: admin })
  assert.equal(controlStatus.status, 200)
  assert.equal(controlStatus.body.sources.find((source) => source.id === "tui").count, 1)

  const pairing = await provided.pair()
  assert.match(pairing.link, new RegExp(`http://127\\.0\\.0\\.1:${probePort}/auth/connect/code-a$`))
  assert.equal(pairing.command, `opencode pair --url http://127.0.0.1:${probePort}`)

  const redeemed = await request(probePort, "/auth/connect/code-a")
  assert.equal(redeemed.status, 200)
  assert.match(redeemed.body.token, /^brg1_/)

  const info = await request(probePort, "/api/info", { headers: { authorization: basic(redeemed.body.token) } })
  assert.equal(info.status, 200)
  assert.equal(info.body.version, "2.4.1")
  assert.deepEqual(info.body.urls, [`http://127.0.0.1:${probePort}`])

  const issued = await request(probePort, "/api/pair", {
    method: "POST",
    headers: { authorization: basic(redeemed.body.token) },
  })
  assert.equal(issued.status, 200)
  assert.equal(issued.body.code, "code-a")
  assert.equal(issued.body.expires_in, 300)

  const projects = await request(probePort, "/api/project", { headers: { authorization: basic(redeemed.body.token) } })
  assert.equal(projects.status, 200)
  assert.deepEqual(projects.body.map((project) => project.id).sort(), ["pa", "pb"])

  const tui = await provided.createDevice("TUI")
  assert.match(tui.token, /^brg1_/)
  const tuiInfo = await request(probePort, "/api/info", { headers: { authorization: basic(tui.token) } })
  assert.equal(tuiInfo.status, 200)

  const removed = await request(probePort, `/bridge/v1/admin/servers/tui/${encodeURIComponent(added.body.data[0].id)}`, {
    method: "DELETE",
    headers: admin,
  })
  assert.equal(removed.status, 200)
  assert.equal(removed.body.data.length, 0)
  const projectsAfter = await request(probePort, "/api/project", { headers: { authorization: basic(redeemed.body.token) } })
  assert.deepEqual(projectsAfter.body.map((project) => project.id), ["pa"])

  const remotePair = await provided.pair("remote")
  assert.match(remotePair.link, /^https:\/\/bridge-test\.tunnel\.test\/auth\/connect\/code-a$/)
  assert.equal(remotePair.command, "opencode pair --url https://bridge-test.tunnel.test")
  assert.equal(remotePair.remote, true)
  assert.match(remotePair.qr, /^<svg/)
  const remoteSnapshot = await provided.snapshot()
  assert.equal(remoteSnapshot.remote.state, "on")
  assert.equal(remoteSnapshot.config.remoteEnabled, true)
  assert.equal(remoteSnapshot.config.remoteRoute, "bridge-test")

  const infoRemote = await request(probePort, "/api/info", { headers: { authorization: basic(tui.token) } })
  assert.deepEqual(infoRemote.body.urls, ["https://bridge-test.tunnel.test"])

  const dismissed = await provided.setRemote(false)
  assert.equal(dismissed.remote.state, "off")
  assert.equal(dismissed.config.remoteEnabled, false)

  const devices = await provided.snapshot()
  assert.equal(devices.devices.length, 2)
  for (const device of devices.devices) await provided.revokeDevice(device.id)
  const after = await provided.snapshot()
  assert.equal(after.devices.length, 0)
  const rejected = await request(probePort, "/api/info", { headers: { authorization: basic(redeemed.body.token) } })
  assert.equal(rejected.status, 401)

  const off = await provided.setEnabled(false)
  assert.equal(off.status.state, "off")
})
