"use strict"

const os = require("node:os")
const { parseUrl } = require("./util.js")

const DEFAULT_PORT = 47821
const DEFAULT_HOST = "127.0.0.1"

const DEFAULT_CONFIG = {
  enabled: false,
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  publicUrl: "",
  hiddenServers: [],
  configServer: "sidecar",
}

function loopback(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}

function normalizePublicUrl(value) {
  if (!value) return { value: "", basePath: "", error: undefined }
  const parsed = parseUrl(value.trim())
  if (!parsed || !/^https?:$/.test(parsed.protocol) || !parsed.hostname) {
    return { value: "", basePath: "", error: "Use an http(s) URL without credentials, query or fragment." }
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { value: "", basePath: "", error: "Use an http(s) URL without credentials, query or fragment." }
  }
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")
  if (path === "/api" || path.endsWith("/api")) {
    return { value: "", basePath: "", error: "A bridge path prefix must not end in /api; clients strip that suffix." }
  }
  return { value: `${parsed.origin}${path}`, basePath: path, error: undefined }
}

function normalizeConfig(input) {
  const config = { ...DEFAULT_CONFIG, ...(input || {}) }
  const host = String(config.host || DEFAULT_HOST).trim() || DEFAULT_HOST
  const port = Number(config.port)
  const publicUrl = normalizePublicUrl(String(config.publicUrl || ""))
  const hiddenServers = Array.isArray(config.hiddenServers)
    ? [...new Set(config.hiddenServers.filter((id) => typeof id === "string" && id))]
    : []
  return {
    value: {
      enabled: Boolean(config.enabled),
      host,
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT,
      publicUrl: publicUrl.value,
      hiddenServers,
      configServer: typeof config.configServer === "string" && config.configServer ? config.configServer : "sidecar",
    },
    basePath: publicUrl.basePath,
    error: publicUrl.error,
  }
}

function ipv4Addresses() {
  const entries = []
  const interfaces = os.networkInterfaces()
  for (const [name, aliases] of Object.entries(interfaces)) {
    for (const alias of aliases || []) {
      if (alias.family !== "IPv4" || alias.internal) continue
      entries.push({ name, address: alias.address })
    }
  }
  return entries
}

function addressHint(config) {
  if (config.publicUrl) return config.publicUrl
  if (!loopback(config.host)) {
    const first = ipv4Addresses()[0]
    if (first) return `http://${first.address}:${config.port}`
  }
  return `http://${config.host === "0.0.0.0" || config.host === "::" || config.host === "[::]" ? "127.0.0.1" : config.host}:${config.port}`
}

function reachableAddresses(config) {
  const values = []
  if (config.publicUrl) values.push(config.publicUrl)
  values.push(`http://127.0.0.1:${config.port}`)
  for (const entry of ipv4Addresses()) values.push(`http://${entry.address}:${config.port}`)
  return [...new Set(values)]
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_PORT,
  DEFAULT_HOST,
  loopback,
  normalizeConfig,
  normalizePublicUrl,
  ipv4Addresses,
  addressHint,
  reachableAddresses,
}
