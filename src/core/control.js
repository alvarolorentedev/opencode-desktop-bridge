"use strict"

const { timingSafeEqual } = require("node:crypto")
const { bufferJson, sendJson } = require("./http.js")
const { normalizeUrl, manualId } = require("./catalog.js")

const PREFIX = "/bridge/v1/admin"
const MAX_BODY = 256 * 1024
const MAX_SERVERS = 64

const DEFAULT_SOURCES = [
  { id: "desktop", name: "OpenCode Desktop", writable: false },
  { id: "tui", name: "TUI", writable: true },
  { id: "web", name: "Web", writable: true },
]

function createControlPlane(options) {
  const adminToken = options.adminToken
  const sources = Array.isArray(options.sources) && options.sources.length ? options.sources : DEFAULT_SOURCES
  const readSource = options.readSource
  const writeSource = options.writeSource
  const snapshot = options.snapshot || (() => [])
  const pair = options.pair
  const baseUrl = options.baseUrl || (() => "")
  const version = options.version || "0.0.0"
  const onChange = options.onChange || (() => {})
  const log = options.log || (() => {})

  function match(pathname) {
    return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`)
  }

  function cors(req, res) {
    const origin = req.headers.origin
    if (typeof origin !== "string" || !origin) return
    res.setHeader("access-control-allow-origin", origin)
    res.setHeader("vary", "Origin")
    res.setHeader("access-control-allow-headers", "authorization, content-type, x-bridge-admin-token")
    res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS")
    res.setHeader("access-control-max-age", "600")
    if (req.headers["access-control-request-private-network"] === "true") {
      res.setHeader("access-control-allow-private-network", "true")
    }
  }

  function tokenOf(req) {
    const header = req.headers.authorization
    if (typeof header === "string") {
      const bearer = /^Bearer\s+(.+)$/i.exec(header)
      if (bearer) return bearer[1].trim()
    }
    const custom = req.headers["x-bridge-admin-token"]
    return typeof custom === "string" ? custom.trim() : undefined
  }

  function authorized(req) {
    let expected
    try {
      expected = String(adminToken() || "")
    } catch {
      return false
    }
    if (!expected) return false
    const provided = tokenOf(req)
    if (!provided) return false
    const left = Buffer.from(provided)
    const right = Buffer.from(expected)
    return left.length === right.length && timingSafeEqual(left, right)
  }

  function sourceOf(id) {
    return sources.find((source) => source.id === id && source.writable)
  }

  function read(id) {
    const value = readSource(id)
    return Array.isArray(value) ? value : []
  }

  function redact(list) {
    return list.map((item) => ({
      id: item.id,
      name: item.name,
      url: item.url,
      hasPassword: Boolean(item.password),
    }))
  }

  function normalize(input, source) {
    if (!input || typeof input !== "object") throw new Error("A server object is required.")
    const url = normalizeUrl(input.url)
    if (!url) throw new Error("Use an http(s) URL without credentials.")
    if (url === normalizeUrl(baseUrl())) throw new Error("A source cannot point at this bridge.")
    const password = typeof input.password === "string" ? input.password : ""
    if (password.length > 1024) throw new Error("The password is too long.")
    const name = typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 120)
      : new URL(url).host
    return { id: manualId(source, url), name, url, password }
  }

  function list(source) {
    return {
      source: source.id,
      data: redact(read(source.id)),
    }
  }

  function replace(id, body) {
    const source = sourceOf(id)
    if (!source) return undefined
    if (!body || !Array.isArray(body.servers)) throw new Error("Expected a servers array.")
    if (body.servers.length > MAX_SERVERS) throw new Error(`At most ${MAX_SERVERS} servers are supported.`)
    const seen = new Set()
    const next = []
    for (const item of body.servers) {
      const entry = normalize(item, id)
      if (seen.has(entry.url)) continue
      seen.add(entry.url)
      next.push(entry)
    }
    writeSource(id, next)
    onChange(id, next)
    return list(source)
  }

  function add(id, body) {
    const source = sourceOf(id)
    if (!source) return undefined
    const entry = normalize(body, id)
    const current = read(id)
    if (!current.some((item) => item.url === entry.url) && current.length >= MAX_SERVERS) {
      throw new Error(`At most ${MAX_SERVERS} servers are supported.`)
    }
    const next = [entry, ...current.filter((item) => item.url !== entry.url)]
    writeSource(id, next)
    onChange(id, next)
    return list(source)
  }

  function remove(id, entryId) {
    const source = sourceOf(id)
    if (!source) return undefined
    const current = read(id)
    const next = current.filter((item) => item.id !== entryId)
    if (next.length === current.length) return undefined
    writeSource(id, next)
    onChange(id, next)
    return list(source)
  }

  function sourceList() {
    const servers = snapshot()
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      writable: source.writable,
      count: source.writable ? read(source.id).length : servers.filter((item) => item.source === source.id).length,
    }))
  }

  async function handle(req, res, pathname, searchParams) {
    cors(req, res)
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "content-length": "0" })
      res.end()
      return
    }
    if (!authorized(req)) {
      sendJson(res, 401, { message: "Bridge admin token required." })
      return
    }
    const path = pathname.slice(PREFIX.length) || "/"
    try {
      if (req.method === "GET" && path === "/status") {
        sendJson(res, 200, {
          bridge: 1,
          version,
          baseUrl: baseUrl(),
          sources: sourceList(),
          servers: snapshot(),
        })
        return
      }
      if (req.method === "GET" && path === "/servers") {
        sendJson(res, 200, { data: snapshot(), sources: sourceList() })
        return
      }
      const sourcePath = /^\/sources\/([^/]+)$/.exec(path)
      if (req.method === "GET" && sourcePath) {
        const source = sourceOf(decodeURIComponent(sourcePath[1]))
        if (!source) {
          sendJson(res, 404, { message: "Unknown source." })
          return
        }
        sendJson(res, 200, list(source))
        return
      }
      const replacePath = /^\/servers\/([^/]+)$/.exec(path)
      if (replacePath) {
        const id = decodeURIComponent(replacePath[1])
        if (!sourceOf(id)) {
          sendJson(res, 404, { message: "Unknown source." })
          return
        }
        if (req.method === "PUT") {
          const body = (await bufferJson(req, MAX_BODY)).body
          sendJson(res, 200, replace(id, body))
          return
        }
        if (req.method === "POST") {
          const body = (await bufferJson(req, MAX_BODY)).body
          sendJson(res, 200, add(id, body))
          return
        }
      }
      const removePath = /^\/servers\/([^/]+)\/([^/]+)$/.exec(path)
      if (req.method === "DELETE" && removePath) {
        const id = decodeURIComponent(removePath[1])
        const entryId = decodeURIComponent(removePath[2])
        const result = remove(id, entryId)
        if (!result) {
          sendJson(res, 404, { message: "Server not found in this source." })
          return
        }
        sendJson(res, 200, result)
        return
      }
      if (req.method === "POST" && path === "/pair") {
        const result = await pair()
        sendJson(res, 200, { link: result.link, expiresAt: result.expiresAt })
        return
      }
      sendJson(res, 404, { message: "Not found" })
    } catch (error) {
      log("warn", "bridge control request failed", { path, error: error instanceof Error ? error.message : String(error) })
      if (!res.headersSent) sendJson(res, 400, { message: error instanceof Error ? error.message : "Invalid request." })
      else res.destroy()
    }
  }

  return { match, handle }
}

module.exports = { createControlPlane, PREFIX, DEFAULT_SOURCES }
