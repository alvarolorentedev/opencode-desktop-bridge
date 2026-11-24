"use strict"

const { sha256 } = require("./util.js")

// Normalizes an upstream URL to the identity the catalog dedupes on.
function normalizeUrl(value) {
  if (typeof value !== "string") return undefined
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return undefined
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
  if (url.username || url.password) return undefined
  url.hash = ""
  url.search = ""
  return url.href.replace(/\/+$/, "")
}

function manualId(source, url) {
  return `${source}:${sha256(url).slice(0, 16)}`
}

// One list for every configuration source: Desktop's live servers, plus the
// manual sources the TUI and web clients write through the control plane.
function createCatalog(options) {
  const sources = Array.isArray(options.sources) ? options.sources : []
  const hidden = options.hidden || (() => [])
  const selected = options.configServer || (() => undefined)
  const log = options.log || (() => {})

  function hiddenSet() {
    try {
      const value = hidden()
      return value instanceof Set ? value : new Set(Array.isArray(value) ? value : [])
    } catch (error) {
      log("warn", "bridge hidden list failed", { error: String(error && error.message ? error.message : error) })
      return new Set()
    }
  }

  function all() {
    const seen = new Map()
    const ids = new Set()
    const result = []
    const excluded = hiddenSet()
    for (const source of sources) {
      let entries
      try {
        entries = source.entries()
      } catch (error) {
        log("warn", "bridge source failed", {
          source: source.id,
          error: String(error && error.message ? error.message : error),
        })
        continue
      }
      if (!Array.isArray(entries)) continue
      for (const raw of entries) {
        if (!raw || typeof raw.id !== "string" || !raw.id) continue
        const url = normalizeUrl(raw.url)
        if (!url || seen.has(url)) continue
        let id = raw.id
        if (ids.has(id)) id = `${source.id}:${id}`
        while (ids.has(id)) id = `${source.id}:${id}`
        ids.add(id)
        const entry = {
          id,
          name: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
          url,
          headers: raw.headers,
          source: source.id,
          connected: raw.connected !== false,
          builtin: Boolean(raw.builtin),
          local: Boolean(raw.local),
          exposed: !excluded.has(id),
        }
        seen.set(url, entry)
        result.push(entry)
      }
    }
    return result
  }

  function exposed() {
    return all().filter((entry) => entry.exposed)
  }

  function configServer() {
    const visible = exposed()
    if (!visible.length) return undefined
    let wanted
    try {
      wanted = selected()
    } catch {
      wanted = undefined
    }
    return (
      visible.find((entry) => entry.id === wanted) ||
      visible.find((entry) => entry.builtin) ||
      visible.find((entry) => entry.source === "desktop") ||
      visible[0]
    ).id
  }

  function resolve(id) {
    if (typeof id !== "string" || !id) return undefined
    const entry = all().find((item) => item.id === id)
    if (!entry) return undefined
    return { url: entry.url, headers: entry.headers }
  }

  function servers() {
    return exposed().map((entry) => ({
      id: entry.id,
      name: entry.name,
      connected: entry.connected,
      builtin: entry.builtin,
      local: entry.local,
      source: entry.source,
    }))
  }

  function snapshot() {
    const current = configServer()
    return all().map((entry) => ({
      id: entry.id,
      name: entry.name,
      connected: entry.connected,
      builtin: entry.builtin,
      local: entry.local,
      source: entry.source,
      exposed: entry.exposed,
      configServer: entry.id === current,
    }))
  }

  return { all, exposed, servers, resolve, configServer, snapshot }
}

module.exports = { createCatalog, normalizeUrl, manualId }
