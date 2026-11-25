"use strict"

const http = require("node:http")

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolve(server.address().port)
    })
  })
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()))
}

function createUpstream(name) {
  const calls = []
  const sessions = new Map([
    [`${name}-s1`, { id: `${name}-s1`, projectID: `p${name}`, location: { directory: `/${name}` }, title: `${name} one` }],
    [`${name}-s2`, { id: `${name}-s2`, projectID: `p${name}`, location: { directory: `/${name}` }, title: `${name} two` }],
  ])
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://upstream.invalid")
    calls.push({ method: req.method, path: url.pathname, search: url.search, authorization: req.headers.authorization })
    const send = (status, body) => {
      const payload = JSON.stringify(body)
      res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) })
      res.end(payload)
    }
    if (url.pathname === "/api/info") {
      return send(200, { version: "2.4.1", pid: 1234, hostname: "secret-host", urls: ["http://10.0.0.1:4096"], paths: { tmp: "/private/tmp" }, capabilities: { persistentPty: true } })
    }
    if (url.pathname === "/api/pair" && req.method === "POST") {
      return send(200, { code: `code-${name}`, expires_in: 300 })
    }
    if (url.pathname.startsWith("/api/rpc/desktop-bridge.remote/")) {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", () => {
        let body = {}
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          body = {}
        }
        const method = url.pathname.split("/").pop()
        if (method === "attach") {
          return send(200, {
            output: { url: "https://bridge-test.tunnel.test", route: (body.input && body.input.route) || "bridge-test" },
          })
        }
        if (method === "detach") return send(200, { output: { ok: true } })
        if (method === "status") {
          return send(200, { output: { state: "on", url: "https://bridge-test.tunnel.test", error: "" } })
        }
        if (method === "qr") return send(200, { output: { svg: '<svg data-test="qr"></svg>' } })
        return send(404, { message: "Unknown rpc" })
      })
      return
    }
    if (url.pathname.startsWith("/auth/connect/")) {
      return send(200, { token: "native-token" })
    }
    if (url.pathname === "/api/project") {
      return send(200, [
        { id: `p${name}`, worktree: `/${name}`, canonical: `/${name}`, name: `Project ${name}` },
      ])
    }
    if (url.pathname === "/api/fs/list") {
      const path = url.searchParams.get("path") || "/"
      return send(200, {
        location: { directory: path },
        data: [
          { path: `${name}-child`, type: "directory" },
          { path: `${name}.txt`, type: "file" },
        ],
      })
    }
    if (url.pathname === "/api/session" && req.method === "GET") {
      return send(200, { data: [...sessions.values()], cursor: {} })
    }
    if (url.pathname === "/api/session/active") {
      return send(200, { data: { [`${name}-s1`]: "busy" } })
    }
    if (url.pathname === "/api/session" && req.method === "POST") {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {}
        const id = `new-${name}`
        const session = { id, projectID: `p${name}`, location: { directory: body.location.directory }, title: "new" }
        sessions.set(id, session)
        send(200, { data: session })
      })
      return
    }
    const session = /^\/api\/session\/([^/]+)(\/.*)?$/.exec(url.pathname)
    if (session) {
      if (!session[2]) {
        const found = sessions.get(session[1])
        if (!found) return send(404, { message: "not found" })
        if (req.method === "PATCH") {
          let raw = ""
          req.on("data", (chunk) => (raw += chunk))
          req.on("end", () => {
            try {
              const body = raw ? JSON.parse(raw) : {}
              if (typeof body.title === "string") found.title = body.title
            } catch {
              // Keep the stored session on a malformed body.
            }
            send(200, { data: found })
          })
          return
        }
        return send(200, { data: found })
      }
      return send(200, { data: [{ id: "msg", sessionID: session[1], owner: name }] })
    }
    if (url.pathname === "/api/permission/request") return send(200, { data: [{ id: `perm-${name}`, sessionID: `${name}-s1` }] })
    if (url.pathname === "/api/form") return send(200, { data: [{ id: `form-${name}`, sessionID: `${name}-s2` }] })
    if (url.pathname === "/api/pty") return send(200, { data: [{ id: `pty-${name}` }] })
    if (url.pathname === "/api/config") return send(200, { name, model: "test/model" })
    if (url.pathname === "/api/location") {
      const directory = url.searchParams.get("location[directory]") || url.searchParams.get("directory") || `/${name}`
      return send(200, { data: { project: { id: `p${name}`, worktree: directory, canonical: directory }, directory } })
    }
    if (url.pathname === "/api/event") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      res.write(`data: ${JSON.stringify({ id: `evt_${name}`, type: "session.status", data: { sessionID: `s-${name}` } })}\n\n`)
      const timer = setInterval(() => res.write(": keepalive\n\n"), 1000)
      req.on("close", () => clearInterval(timer))
      return
    }
    return send(404, { message: `not found: ${url.pathname}` })
  })
  return { name, server, calls, sessions }
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: options.method || "GET", headers: options.headers || {} },
      (res) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          let body
          try {
            body = raw ? JSON.parse(raw) : undefined
          } catch {
            body = raw
          }
          resolve({ status: res.statusCode, headers: res.headers, body, raw })
        })
      },
    )
    req.on("error", reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

function basic(token, username = "opencode") {
  return `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`
}

module.exports = { listen, close, createUpstream, request, basic }
