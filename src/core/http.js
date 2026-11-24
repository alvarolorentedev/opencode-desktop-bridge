"use strict"

const http = require("node:http")
const https = require("node:https")
const net = require("node:net")
const tls = require("node:tls")
const { joinPath } = require("./util.js")

const REQUEST_DROP = new Set([
  "host",
  "authorization",
  "cookie",
  "proxy-authorization",
  "proxy-connection",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "origin",
  "referer",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
])

const RESPONSE_DROP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "trailer",
  "upgrade",
  "set-cookie",
  "www-authenticate",
  "location",
])

function upstreamUrl(endpoint, pathname, search) {
  const url = new URL(endpoint.url)
  url.pathname = joinPath(url.pathname, pathname)
  url.search = search || ""
  return url
}

function requestHeaders(input, endpoint, url) {
  const headers = {}
  for (const [name, value] of Object.entries(input || {})) {
    if (value === undefined || value === null) continue
    const key = name.toLowerCase()
    if (REQUEST_DROP.has(key)) continue
    if (key === "auth_token") continue
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value)
  }
  for (const [name, value] of Object.entries(endpoint.headers || {})) {
    if (typeof value === "string" && value) headers[name.toLowerCase()] = value
  }
  headers.host = url.host
  return headers
}

function responseHeaders(input) {
  const headers = {}
  for (const [name, value] of Object.entries(input || {})) {
    if (value === undefined || value === null) continue
    const key = name.toLowerCase()
    if (RESPONSE_DROP.has(key)) continue
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value)
  }
  return headers
}

function library(url) {
  return url.protocol === "https:" ? https : http
}

function requestJson(endpoint, pathname, search, options = {}) {
  return new Promise((resolve, reject) => {
    const url = upstreamUrl(endpoint, pathname, search)
    const headers = {
      accept: "application/json",
      ...(options.headers || {}),
      ...(endpoint.headers || {}),
    }
    const body = options.body
    if (body !== undefined) {
      headers["content-type"] = headers["content-type"] || "application/json"
      headers["content-length"] = Buffer.byteLength(body)
    }
    const timeoutMs = options.timeoutMs === undefined ? 30000 : options.timeoutMs
    const controller = new AbortController()
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined
    const finish = (fn) => {
      if (timer) clearTimeout(timer)
      fn()
    }
    const req = library(url).request(
      url,
      { method: options.method || "GET", headers, signal: controller.signal },
      (res) => {
        const chunks = []
        let size = 0
        res.on("data", (chunk) => {
          size += chunk.length
          if (size > (options.limit || 4 * 1024 * 1024)) {
            req.destroy(new Error("Upstream response too large"))
            return
          }
          chunks.push(chunk)
        })
        res.on("end", () => {
          const raw = Buffer.concat(chunks)
          let parsed
          try {
            parsed = raw.length ? JSON.parse(raw.toString("utf8")) : undefined
          } catch {
            parsed = undefined
          }
          finish(() => resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed, raw }))
        })
        res.on("error", (error) => finish(() => reject(error)))
      },
    )
    req.on("timeout", () => req.destroy(new Error("Upstream request timed out")))
    req.on("error", (error) => finish(() => reject(error)))
    if (body !== undefined) req.write(body)
    req.end()
  })
}

function proxy(req, res, endpoint, pathname, search, options = {}) {
  const url = upstreamUrl(endpoint, pathname, search)
  const headers = requestHeaders(req.headers, endpoint, url)
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || (req.method === "GET" || req.method === "HEAD" ? 15000 : 120000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const clear = () => clearTimeout(timer)
  const upstream = library(url).request(
    url,
    { method: req.method, headers, signal: controller.signal },
    (response) => {
      clear()
      if (res.headersSent || res.destroyed) {
        response.destroy()
        return
      }
      res.writeHead(response.statusCode || 502, responseHeaders(response.headers))
      res.flushHeaders()
      response.pipe(res)
      response.on("error", () => res.destroy())
      response.on("aborted", () => res.destroy())
    },
  )
  upstream.on("error", (error) => {
    clear()
    if (res.destroyed) return
    if (res.headersSent) {
      res.destroy()
      return
    }
    if (options.onError) {
      options.onError(error)
      return
    }
    const payload = JSON.stringify({ message: "The OpenCode server is unavailable." })
    res.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "cache-control": "no-store",
    })
    res.end(payload)
  })
  res.on("close", () => {
    clear()
    if (!res.writableEnded) upstream.destroy()
  })
  req.on("aborted", () => upstream.destroy())
  req.pipe(upstream)
}

function bufferJson(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error("Request body too large"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      const raw = Buffer.concat(chunks)
      let body
      try {
        body = raw.length ? JSON.parse(raw.toString("utf8")) : undefined
      } catch {
        body = undefined
      }
      resolve({ body, raw })
    })
    req.on("error", reject)
  })
}

function sendJson(res, status, body, headers) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...headers,
  })
  res.end(payload)
}

function tunnel(endpoint, pathname, search, client, head, headers, options = {}) {
  const url = upstreamUrl(endpoint, pathname, search)
  const secure = url.protocol === "https:"
  const port = Number(url.port || (secure ? 443 : 80))
  const host = url.hostname
  let upstream
  if (secure) {
    upstream = tls.connect({ host, port, servername: host, rejectUnauthorized: true })
  } else {
    upstream = net.connect({ host, port })
  }
  upstream.setNoDelay(true)
  client.setNoDelay(true)
  client.pause()
  const connectTimer = setTimeout(() => {
    upstream.destroy()
    client.destroy()
  }, 10000)

  const lines = [`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`, "Connection: Upgrade", "Upgrade: websocket"]
  for (const name of ["sec-websocket-key", "sec-websocket-version", "sec-websocket-protocol", "sec-websocket-extensions"]) {
    const value = headers && headers[name]
    if (value) lines.push(`${name.replace(/\b\w/g, (letter) => letter.toUpperCase())}: ${value}`)
  }
  if (endpoint.headers && endpoint.headers.authorization) lines.push(`Authorization: ${endpoint.headers.authorization}`)
  lines.push("", "")

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(connectTimer)
    upstream.destroy()
    client.destroy()
  }

  upstream.once(secure ? "secureConnect" : "connect", () => {
    clearTimeout(connectTimer)
    upstream.write(lines.join("\r\n"))
    if (head && head.length) upstream.write(head)
    upstream.pipe(client)
    client.pipe(upstream)
    client.resume()
  })
  upstream.on("error", close)
  client.on("error", close)
  client.on("close", close)
  upstream.on("close", close)
  if (options.onSocket) options.onSocket({ upstream, client, close })
}

module.exports = {
  upstreamUrl,
  requestHeaders,
  responseHeaders,
  requestJson,
  proxy,
  bufferJson,
  sendJson,
  tunnel,
}
