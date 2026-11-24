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
const { basicAuth, errorMessage, randomId } = require("../core/util.js")

const VERSION = "0.1.0"

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

  function baseFor(config) {
    return normalizeConfig(config).value.publicUrl || addressHint(normalizeConfig(config).value)
  }

  async function pairLink() {
    const endpoint = endpoints && endpoints.get("sidecar")
    if (!endpoint) throw new Error("The Desktop server is not ready yet.")
    const result = await issuePairing(endpoint)
    return {
      link: `${baseFor(getConfig())}/auth/connect/${encodeURIComponent(result.code)}`,
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
    pair: pairLink,
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
    if (!config.enabled) return
    if (normalized.error) {
      status.state = "error"
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
    } catch (error) {
      bridge = undefined
      status = {
        state: "error",
        error: errorMessage(error),
        baseUrl: baseFor(config),
        addresses: reachableAddresses(config),
        port: config.port,
      }
      writeLog("error", "could not listen", { error: errorMessage(error), host: config.host, port: config.port })
    }
  }

  function schedule() {
    applying = applying.then(apply, apply)
    return applying
  }

  ctx.onCleanup(async () => {
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
        baseUrl: status.baseUrl || baseFor(config),
        addresses: reachableAddresses(config),
        port: bridge ? bridge.port : status.port,
      },
      servers: catalog.snapshot(),
      devices: devices.list(),
      sidecarReady: Boolean(endpoints && endpoints.get("sidecar")),
      adminToken: adminStore.value.token,
      bridgeVersion: VERSION,
      appVersion: ctx.app.version,
    }
  }

  async function pair() {
    if (status.state !== "running") throw new Error("Start the bridge before pairing a device.")
    const result = await pairLink()
    return {
      ...result,
      command: `opencode pair --url ${baseFor(getConfig())}`,
    }
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
    pair: async () => pair(),
  })
}

module.exports = setup
module.exports.setup = setup
