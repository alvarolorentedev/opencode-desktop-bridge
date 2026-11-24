"use strict"

const { Schema } = require("effect")
const { BridgeIpc, Config } = require("./contract.js")
const {
  createBridge,
  createCatalog,
  createControlPlane,
  createDeviceStore,
  createServerRegistry,
  issuePairing,
  redeemPairing,
  normalizeConfig,
  reachableAddresses,
  addressHint,
} = require("../core/index.js")
const { DEFAULT_CONFIG } = require("../core/config.js")
const { requestJson } = require("../core/http.js")
const { basicAuth, errorMessage, randomId } = require("../core/util.js")

const VERSION = "0.2.2"
const RPC_ID = "desktop-bridge.remote"
const REMOTE_TIMEOUT = 180000

const DeviceRecord = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  hash: Schema.String,
  createdAt: Schema.Number,
  lastSeenAt: Schema.Number,
  expiresAt: Schema.Number,
})

const ManualServer = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  url: Schema.String,
  password: Schema.String,
})

const Sources = Schema.Struct({
  tui: Schema.Array(ManualServer),
  web: Schema.Array(ManualServer),
})

const Admin = Schema.Struct({ token: Schema.String })

function setup(ctx) {
  const configStore = ctx.storage.store("config", { schema: Config, initial: DEFAULT_CONFIG })
  const deviceStore = ctx.storage.store("devices", { schema: Schema.Array(DeviceRecord), initial: [] })
  const sourcesStore = ctx.storage.store("sources", { schema: Sources, initial: { tui: [], web: [] } })
  const adminStore = ctx.storage.store("admin", { schema: Admin, initial: { token: randomId("adm_", 32) } })
  const endpoints = ctx.serverEndpoints

  function writeLog(level, message, data) {
    try {
      ctx.log.write(level, `bridge: ${message}`, data)
    } catch {
      // Logging must never take the bridge down.
    }
  }

  const devices = createDeviceStore({
    load: () => deviceStore.value,
    save: (next) => deviceStore.set(next),
    log: writeLog,
  })

  function getConfig() {
    return normalizeConfig(configStore.value).value
  }

  function setConfig(next) {
    configStore.set(normalizeConfig(next).value)
  }

  let bridge
  let status = { state: "off", error: "", baseUrl: "", addresses: [], port: getConfig().port }
  let applying = Promise.resolve()
  let remote = { state: "off", url: "", error: "" }
  let remoteQueue = Promise.resolve()

  function queueRemote(run) {
    const next = remoteQueue.then(run, run)
    remoteQueue = next.catch(() => {})
    return next
  }

  async function remoteRpc(method, input = {}, timeoutMs = REMOTE_TIMEOUT) {
    const endpoint = endpoints && endpoints.get("sidecar")
    if (!endpoint) throw new Error("OpenCode Desktop's server is not ready yet.")
    const response = await requestJson(endpoint, `/api/rpc/${RPC_ID}/${method}`, "", {
      method: "POST",
      body: JSON.stringify({ input }),
      timeoutMs,
    })
    if (response.status < 200 || response.status >= 300) {
      const message =
        response.body && typeof response.body.message === "string"
          ? response.body.message
          : `Remote access request failed (${response.status}).`
      throw new Error(response.status === 404 ? "Remote access is not available. Restart OpenCode Desktop so the plugin server part loads." : message)
    }
    return (response.body && response.body.output) || {}
  }

  function remoteHost(config) {
    const host = String(config.host || "127.0.0.1")
    if (host === "0.0.0.0" || host === "::" || host === "[::]" || host === "::1" || host === "[::1]") return "127.0.0.1"
    if (host.includes(":") && !host.startsWith("[")) return `[${host}]`
    return host
  }

  let disposed = false

  // The sidecar can start after the plugin. Keep trying while the remote is
  // wanted, instead of leaving an already-paired phone offline until a refresh.
  function scheduleRemoteRetry() {
    if (disposed) return
    const timer = setTimeout(() => {
      const config = getConfig()
      if (!disposed && config.enabled && config.remoteEnabled && remote.state === "starting") void syncRemote()
    }, 3000)
    timer.unref?.()
  }

  function syncRemote() {
    return queueRemote(async () => {
      const config = getConfig()
      if (!config.enabled || !config.remoteEnabled) {
        if (remote.state !== "off") {
          remote = { state: "off", url: "", error: "" }
          try {
            await remoteRpc("detach", {}, 5000)
          } catch {
            // The server part may not be loaded yet; the route is local to it anyway.
          }
        }
        return remote
      }
      if (!bridge || !bridge.running) return remote
      remote = { state: "starting", url: "", error: "" }
      if (!endpoints || !endpoints.get("sidecar")) {
        scheduleRemoteRetry()
        return remote
      }
      try {
        const output = await remoteRpc("attach", {
          host: remoteHost(config),
          port: bridge.port,
          route: config.remoteRoute || "",
        })
        if (output.route && output.route !== getConfig().remoteRoute) {
          setConfig({ ...getConfig(), remoteRoute: output.route })
        }
        remote = { state: "on", url: String(output.url || ""), error: "" }
      } catch (error) {
        remote = { state: "error", url: "", error: errorMessage(error) }
        writeLog("warn", "remote access failed", { error: remote.error })
      }
      return remote
    })
  }

  function detachRemote() {
    return queueRemote(async () => {
      remote = { state: "off", url: "", error: "" }
      try {
        await remoteRpc("detach", {}, 5000)
      } catch {
        // Nothing to close when the server part is gone.
      }
      return remote
    })
  }

  async function makeQr(text) {
    try {
      const output = await remoteRpc("qr", { text }, 10000)
      return typeof output.svg === "string" ? output.svg : ""
    } catch (error) {
      writeLog("warn", "pairing QR unavailable", { error: errorMessage(error) })
      return ""
    }
  }

  const registry = createServerRegistry({
    getConfig,
    setConfig,
    onChange: () => bridge?.notifyChanged(),
  })

  function desktopEntries() {
    const entries = []
    for (const item of registry.servers()) {
      const endpoint = endpoints && endpoints.get(item.id)
      if (!endpoint || typeof endpoint.url !== "string") continue
      entries.push({
        id: item.id,
        name: item.name,
        url: endpoint.url,
        headers: endpoint.headers,
        connected: item.connected,
        builtin: item.builtin,
        local: item.local,
      })
    }
    return entries
  }

  function manualEntries(list) {
    return (Array.isArray(list) ? list : []).map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
      headers: item.password ? { authorization: basicAuth(item.password) } : undefined,
      connected: true,
    }))
  }

  // Every configuration surface contributes here. Desktop is live; the TUI and
  // web sources are written through the admin control plane.
  const catalog = createCatalog({
    hidden: () => getConfig().hiddenServers,
    configServer: () => getConfig().configServer,
    log: writeLog,
    sources: [
      { id: "desktop", name: "OpenCode Desktop", entries: desktopEntries },
      { id: "tui", name: "TUI", entries: () => manualEntries(sourcesStore.value.tui) },
      { id: "web", name: "Web", entries: () => manualEntries(sourcesStore.value.web) },
    ],
  })

  function readSource(id) {
    const value = sourcesStore.value
    return Array.isArray(value[id]) ? value[id] : []
  }

  function writeSource(id, list) {
    sourcesStore.set({ ...sourcesStore.value, [id]: list })
  }

  function localBase(config) {
    const value = normalizeConfig(config).value
    return value.publicUrl || addressHint(value)
  }

  function baseFor(config) {
    const value = normalizeConfig(config).value
    return value.publicUrl || (remote.state === "on" && remote.url ? remote.url : addressHint(value))
  }

  async function pairing(mode = "local") {
    let config = getConfig()
    if (!config.enabled) {
      setConfig({ ...config, enabled: true })
      await schedule()
      config = getConfig()
    }
    if (!bridge || !bridge.running) throw new Error("The bridge is not running. Check the port in Advanced.")

    let base
    if (mode === "remote") {
      setConfig({ ...config, remoteEnabled: true })
      await syncRemote()
      if (remote.state !== "on" || !remote.url) {
        throw new Error(remote.error || "Internet access is not ready yet. Try again.")
      }
      base = remote.url
    } else {
      base = localBase(config)
    }

    const endpoint = endpoints && endpoints.get("sidecar")
    if (!endpoint) throw new Error("The Desktop server is not ready yet.")
    const result = await issuePairing(endpoint)
    const clean = String(base || "").replace(/\/+$/, "")
    if (!clean) throw new Error("The bridge has no reachable address.")
    const qr = await makeQr(JSON.stringify({ code: result.code, urls: [clean] }))
    return {
      link: `${clean}/auth/connect/${encodeURIComponent(result.code)}`,
      command: `opencode pair --url ${clean}`,
      code: result.code,
      urls: [clean],
      qr,
      base: clean,
      remote: mode === "remote",
      expiresAt: Date.now() + (result.expiresIn || 300) * 1000,
    }
  }

  const control = createControlPlane({
    adminToken: () => adminStore.value.token,
    readSource,
    writeSource,
    snapshot: () => catalog.snapshot(),
    baseUrl: () => baseFor(getConfig()),
    version: VERSION,
    pair: () => pairing(remote.state === "on" ? "remote" : "local"),
    log: writeLog,
    onChange: () => {
      bridge?.notifyChanged()
    },
  })

  async function apply() {
    const previous = bridge
    bridge = undefined
    if (previous) await previous.stop()

    const normalized = normalizeConfig(configStore.value)
    const config = normalized.value
    status = {
      state: "off",
      error: normalized.error || "",
      baseUrl: baseFor(config),
      addresses: reachableAddresses(config),
      port: config.port,
    }
    if (!config.enabled) {
      if (remote.state !== "off") void detachRemote()
      return
    }
    if (normalized.error) {
      status.state = "error"
      if (remote.state !== "off") void detachRemote()
      return
    }

    status.state = "starting"
    const instance = createBridge({
      resolveServer: (id) => catalog.resolve(id),
      servers: () => catalog.servers(),
      configServer: () => catalog.configServer(),
      redeem: async (code) => {
        const endpoint = endpoints && endpoints.get("sidecar")
        if (!endpoint) return false
        return redeemPairing(endpoint, code)
      },
      issuePairing: async () => {
        const endpoint = endpoints && endpoints.get("sidecar")
        if (!endpoint) throw new Error("The Desktop server is not ready yet.")
        return issuePairing(endpoint)
      },
      devices,
      control,
      appVersion: ctx.app.version,
      baseUrl: () => baseFor(getConfig()),
      log: writeLog,
    })
    bridge = instance
    try {
      const address = await instance.start({
        host: config.host,
        port: config.port,
        basePath: normalized.basePath,
      })
      status = {
        state: "running",
        error: "",
        baseUrl: baseFor(config),
        addresses: reachableAddresses(config),
        port: address.port,
      }
      if (config.remoteEnabled) void syncRemote()
      else if (remote.state !== "off") void detachRemote()
    } catch (error) {
      bridge = undefined
      status = {
        state: "error",
        error: errorMessage(error),
        baseUrl: baseFor(config),
        addresses: reachableAddresses(config),
        port: config.port,
      }
      if (remote.state !== "off") void detachRemote()
      writeLog("error", "could not listen", { error: errorMessage(error), host: config.host, port: config.port })
    }
  }

  function schedule() {
    applying = applying.then(apply, apply)
    return applying
  }

  const remoteTimer = setInterval(() => {
    const config = getConfig()
    if (disposed || !config.enabled || !config.remoteEnabled || remote.state !== "on") return
    void remoteRpc("status", {}, 5000).then(
      (output) => {
        if (disposed) return
        if (!output || output.state !== "on") void syncRemote()
      },
      () => {
        // The sidecar restarted and the server part lost its route.
        if (!disposed) void syncRemote()
      },
    )
  }, 10000)
  remoteTimer.unref?.()

  ctx.onCleanup(async () => {
    disposed = true
    clearInterval(remoteTimer)
    if (remote.state !== "off") {
      try {
        await remoteRpc("detach", {}, 1500)
      } catch {
        // The server part closes its own route when it unloads.
      }
      remote = { state: "off", url: "", error: "" }
    }
    const current = bridge
    bridge = undefined
    if (current) await current.stop()
  })

  if (ctx.windows && typeof ctx.windows.on === "function") {
    ctx.windows.on("close", (window) => registry.forget(window.id))
  }

  void schedule()

  function snapshot() {
    const config = getConfig()
    return {
      config,
      status: {
        state: status.state,
        error: status.error,
        baseUrl: baseFor(config),
        addresses: reachableAddresses(config),
        port: bridge ? bridge.port : status.port,
      },
      servers: catalog.snapshot(),
      devices: devices.list(),
      remote: { ...remote },
      sidecarReady: Boolean(endpoints && endpoints.get("sidecar")),
      adminToken: adminStore.value.token,
      bridgeVersion: VERSION,
      appVersion: ctx.app.version,
    }
  }

  function pair(mode = "local") {
    return pairing(mode === "remote" ? "remote" : "local")
  }

  ctx.provide(BridgeIpc, {
    snapshot: async () => snapshot(),
    reportServers: async (servers, caller) => {
      registry.report(caller && typeof caller.window === "number" ? caller.window : 0, servers)
    },
    setEnabled: async (enabled) => {
      setConfig({ ...getConfig(), enabled })
      await schedule()
      return snapshot()
    },
    setRemote: async (enabled) => {
      setConfig({ ...getConfig(), remoteEnabled: Boolean(enabled) })
      if (enabled) await syncRemote()
      else await detachRemote()
      return snapshot()
    },
    setNetwork: async (input) => {
      const normalized = normalizeConfig({ ...getConfig(), host: input.host, port: input.port, publicUrl: input.publicUrl })
      if (normalized.error) throw new Error(normalized.error)
      setConfig(normalized.value)
      await schedule()
      return snapshot()
    },
    setHidden: async (ids) => {
      registry.setHidden(ids)
      bridge?.notifyChanged()
      return snapshot()
    },
    setConfigServer: async (id) => {
      registry.setConfigServer(id)
      bridge?.notifyChanged()
      return snapshot()
    },
    revokeDevice: async (id) => {
      if (bridge) bridge.revokeDevice(id)
      else devices.revoke(id)
      return snapshot()
    },
    createDevice: async (name) => {
      const result = devices.create(String(name || "TUI"))
      return { token: result.token, id: result.device.id }
    },
    pair: async (input) => {
      const mode = typeof input === "string" ? input : input && input.mode
      return pair(mode === "remote" ? "remote" : "local")
    },
  })
}

module.exports = setup
module.exports.setup = setup
