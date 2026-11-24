"use strict"

function createServerRegistry(options) {
  const getConfig = options.getConfig
  const setConfig = options.setConfig
  const onChange = options.onChange || (() => {})
  const windows = new Map()
  let lastSignature = ""

  function report(windowId, list) {
    const clean = (Array.isArray(list) ? list : [])
      .filter((item) => item && typeof item.id === "string" && item.id)
      .map((item) => ({
        id: item.id,
        name: typeof item.name === "string" && item.name ? item.name : item.id,
        connected: Boolean(item.connected),
        builtin: Boolean(item.builtin),
        local: Boolean(item.local),
      }))
    windows.set(windowId, clean)
    changed()
  }

  function forget(windowId) {
    if (!windows.delete(windowId)) return
    changed()
  }

  function servers() {
    const byId = new Map()
    for (const list of windows.values()) {
      for (const item of list) {
        const previous = byId.get(item.id)
        if (!previous) {
          byId.set(item.id, { ...item })
          continue
        }
        previous.connected = previous.connected || item.connected
        if (previous.name === previous.id && item.name !== item.id) previous.name = item.name
        previous.builtin = previous.builtin || item.builtin
        previous.local = previous.local || item.local
      }
    }
    return [...byId.values()].sort((left, right) => {
      if (left.builtin !== right.builtin) return left.builtin ? -1 : 1
      return left.name.localeCompare(right.name)
    })
  }

  function exposed() {
    const config = getConfig()
    const hidden = new Set(config.hiddenServers || [])
    return servers().filter((item) => !hidden.has(item.id))
  }

  function configServer() {
    const config = getConfig()
    const visible = exposed()
    const preferred = visible.find((item) => item.id === config.configServer)
    if (preferred) return preferred.id
    return visible[0] ? visible[0].id : undefined
  }

  function setHidden(ids) {
    const config = getConfig()
    const next = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id))]
    setConfig({ ...config, hiddenServers: next })
    changed()
  }

  function setConfigServer(id) {
    const config = getConfig()
    setConfig({ ...config, configServer: id })
    changed()
  }

  function signature() {
    const selected = (() => {
      try {
        return configServer() || ""
      } catch {
        return ""
      }
    })()
    return `${selected}|${exposed()
      .map((item) => `${item.id}:${item.name}:${item.connected ? 1 : 0}`)
      .join("|")}`
  }

  function changed() {
    const next = signature()
    if (next === lastSignature) return
    lastSignature = next
    onChange()
  }

  function snapshot() {
    const config = getConfig()
    const hidden = new Set(config.hiddenServers || [])
    const selected = configServer()
    return servers().map((item) => ({
      ...item,
      exposed: !hidden.has(item.id),
      configServer: item.id === selected,
    }))
  }

  return { report, forget, servers, exposed, configServer, setHidden, setConfigServer, snapshot }
}

module.exports = { createServerRegistry }
