"use strict"

const http = require("node:http")
const { classify, stripBasePath, directoryFromBody, directoryFromQuery, encodeCursor, decodeCursor } = require("./routing.js")
const { requestJson, bufferJson, sendJson, proxy, tunnel } = require("./http.js")
const { mergeProjects, mergeSessionPages, mergeArrays, itemsOf, rewriteInfo, connectedEvent } = require("./merge.js")
const { createSseReader, frameFromEvent, writeFrame } = require("./sse.js")
const { errorMessage, truncate } = require("./util.js")

const SESSION_TIMEOUT = 8000
const INFO_TTL = 30 * 1000
const CONNECT_TTL = 5 * 60 * 1000
const MAX_ATTEMPTS = 10
const MAX_SSE_PER_DEVICE = 8
const MAX_SSE_TOTAL = 128
const MAX_WS_PER_DEVICE = 16
const MAX_WS_TOTAL = 128

function createBridge(options) {
  const resolveServer = options.resolveServer
  const servers = options.servers
  const configServer = options.configServer
  const redeem = options.redeem
  const issuePairing = options.issuePairing
  const devices = options.devices
  const appVersion = options.appVersion || "0.0.0"
  const baseUrl = options.baseUrl || (() => `http://127.0.0.1:${state.port}`)
  const log = options.log || (() => {})

  const state = {
    server: undefined,
    host: "127.0.0.1",
    port: 0,
    basePath: "",
    running: false,
    sockets: new Set(),
    sse: new Set(),
    ws: new Set(),
    sessions: new Map(),
    ptys: new Map(),
    projects: new Map(),
    directories: new Map(),
    saved: new Map(),
    attempts: new Map(),
    info: undefined,
  }

  function serversNow() {
    try {
      const list = servers()
      return Array.isArray(list) ? list : []
    } catch (error) {
      log("warn", "bridge server list failed", { error: errorMessage(error) })
      return []
    }
  }

  function targets() {
    const result = []
    for (const item of serversNow()) {
      const endpoint = resolveServer(item.id)
      if (endpoint && typeof endpoint.url === "string") result.push({ id: item.id, name: item.name || item.id, endpoint })
    }
    return result
  }

  function targetFor(serverId) {
    if (!serverId) return undefined
    const item = serversNow().find((server) => server.id === serverId)
    if (!item) return undefined
    const endpoint = resolveServer(item.id)
    return endpoint ? { id: item.id, name: item.name || item.id, endpoint } : undefined
  }

  function configTarget() {
    let id
    try {
      id = configServer()
    } catch {
      id = undefined
    }
    return targetFor(id) || targets()[0]
  }

  function publicBase() {
    const value = String(baseUrl() || "").replace(/\/+$/, "")
    return value || `http://127.0.0.1:${state.port}`
  }

  function addDirectory(directory, serverId) {
    if (typeof directory !== "string" || !directory) return
    const owners = state.directories.get(directory) || new Set()
    owners.add(serverId)
    state.directories.set(directory, owners)
  }

  function indexProject(serverId, project) {
    if (!project || typeof project !== "object") return
    if (typeof project.id === "string" && project.id) state.projects.set(project.id, serverId)
    addDirectory(project.worktree, serverId)
    addDirectory(project.canonical, serverId)
  }

  function indexSession(serverId, session) {
    if (!session || typeof session !== "object" || typeof session.id !== "string" || !session.id) return
    state.sessions.set(session.id, serverId)
    if (typeof session.projectID === "string" && session.projectID) state.projects.set(session.projectID, serverId)
    if (session.location && typeof session.location.directory === "string") addDirectory(session.location.directory, serverId)
  }

  function indexPty(serverId, pty) {
    if (!pty || typeof pty !== "object") return
    const id = pty.id || pty.ptyID
    if (typeof id === "string" && id) state.ptys.set(id, serverId)
  }

  function pickDirectory(directory) {
    if (typeof directory !== "string" || !directory) return configTarget()
    const owners = state.directories.get(directory)
    if (owners && owners.size === 1) {
      const target = targetFor([...owners][0])
      if (target) return target
    }
    return configTarget()
  }

  function dropServer(serverId) {
    for (const [id, owner] of state.sessions) if (owner === serverId) state.sessions.delete(id)
    for (const [id, owner] of state.ptys) if (owner === serverId) state.ptys.delete(id)
    for (const [id, owner] of state.projects) if (owner === serverId) state.projects.delete(id)
    for (const [id, owner] of state.saved) if (owner === serverId) state.saved.delete(id)
    for (const [directory, owners] of state.directories) {
      owners.delete(serverId)
      if (!owners.size) state.directories.delete(directory)
    }
  }

  function learnFrame(serverId, frame) {
    if (!frame.includes("sessionID") && !frame.includes("sessionId")) return
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n")
    if (!data) return
    try {
      const event = JSON.parse(data)
      const payload = event && event.data && typeof event.data === "object" ? event.data : event
      const id = payload && (payload.sessionID || payload.sessionId)
      if (typeof id === "string" && id) state.sessions.set(id, serverId)
    } catch {
      // Events are forwarded byte-for-byte; a frame the bridge cannot parse is still valid for the client.
    }
  }

  function learnProjects(entry) {
    if (!entry || !Array.isArray(entry.data)) return
    for (const project of entry.data) indexProject(entry.serverId, project)
  }

  function learnSessions(entry) {
    if (!entry || !entry.data || !Array.isArray(entry.data.data)) return
    for (const session of entry.data.data) indexSession(entry.serverId, session)
  }

  function credential(req, url) {
    const header = req.headers.authorization
    if (typeof header === "string") {
      const basic = /^Basic\s+(.+)$/i.exec(header)
      if (basic) {
        try {
          const decoded = Buffer.from(basic[1], "base64").toString("utf8")
          const separator = decoded.indexOf(":")
          if (separator >= 0) return decoded.slice(separator + 1)
        } catch {
          return undefined
        }
      }
      const bearer = /^Bearer\s+(.+)$/i.exec(header)
      if (bearer) return bearer[1].trim()
    }
    const query = url.searchParams.get("auth_token")
    if (!query) return undefined
    try {
      const decoded = Buffer.from(query, "base64").toString("utf8")
      if (decoded.includes(":")) return decoded.slice(decoded.indexOf(":") + 1)
    } catch {
      // A raw token is accepted as a fallback for clients that cannot set headers.
    }
    return query
  }

  function authenticate(req, url) {
    const token = credential(req, url)
    if (!token) return undefined
    const device = devices.verify(token)
    if (!device) return undefined
    return device
  }

  function unauthorized(res) {
    sendJson(res, 401, { message: "Authentication required" }, { "www-authenticate": 'Basic realm="opencode"' })
  }

  function rateLimited(ip) {    const now = Date.now()
    const entry = state.attempts.get(ip)
    if (!entry || entry.reset <= now) {
      state.attempts.set(ip, { count: 1, reset: now + 60 * 1000 })
      return false
    }
    entry.count += 1
    return entry.count > MAX_ATTEMPTS
  }

  function deviceName(req) {
    const agent = String(req.headers["user-agent"] || "")
    const product = agent.split(/[()]/)[0].trim()
    return truncate(product || "OpenCode device", 60)
  }

  function countSse(deviceId) {
    let count = 0
    for (const client of state.sse) if (client.deviceId === deviceId) count += 1
    return count
  }

  function countWs(deviceId) {
    let count = 0
    for (const entry of state.ws) if (entry.deviceId === deviceId) count += 1
    return count
  }

  async function handlePair(req, res, code) {
    if (typeof code !== "string" || !code || code.length > 256) {
      sendJson(res, 400, { message: "Invalid pairing code" })
      return
    }
    const ip = req.socket.remoteAddress || "unknown"
    if (rateLimited(ip)) {
      sendJson(res, 429, { message: "Too many pairing attempts. Try again in a minute." }, { "retry-after": "60" })
      return
    }
    try {
      const ok = await redeem(code)
      if (!ok) {
        sendJson(res, 401, { message: "This pairing link expired or was already used." })
        return
      }
      const result = devices.create(deviceName(req))
      sendJson(res, 200, { token: result.token })
    } catch (error) {
      log("warn", "bridge pairing redeem failed", { error: errorMessage(error) })
      sendJson(res, 503, { message: "OpenCode Desktop is not ready to pair. Try again." })
    }
  }

  async function readInfo() {
    if (state.info && Date.now() - state.info.at < INFO_TTL) return state.info.value
    const target = configTarget()
    if (target) {
      try {
        const result = await requestJson(target.endpoint, "/api/info", "", { timeoutMs: 2000 })
        if (result.status >= 200 && result.status < 300 && result.body) {
          const value = rewriteInfo(result.body, publicBase(), appVersion)
          state.info = { at: Date.now(), value }
          return value
        }
      } catch (error) {
        log("debug", "bridge info read failed", { server: target.id, error: errorMessage(error) })
      }
    }
    if (state.info) return state.info.value
    return rewriteInfo(undefined, publicBase(), appVersion)
  }

  async function handleInfo(res) {
    sendJson(res, 200, await readInfo())
  }

  async function handleHealth(res) {
    const info = await readInfo()
    sendJson(res, 200, { healthy: true, version: info.version })
  }

  async function collect(pathname, search) {
    const list = targets()
    if (!list.length) return []
    const results = await Promise.allSettled(
      list.map((target) => requestJson(target.endpoint, pathname, search, { timeoutMs: SESSION_TIMEOUT })),
    )
    const entries = []
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.status >= 200 && result.value.status < 300) {
        entries.push({ serverId: list[index].id, data: result.value.body })
      } else {
        log("warn", "bridge upstream read failed", {
          server: list[index].id,
          status: result.status === "fulfilled" ? result.value.status : undefined,
          error: result.status === "rejected" ? errorMessage(result.reason) : undefined,
        })
      }
    })
    return entries
  }

  async function handleProjects(res, searchParams) {
    const search = searchParams.toString() ? `?${searchParams.toString()}` : ""
    const entries = await collect("/api/project", search)
    for (const entry of entries) learnProjects(entry)
    if (!entries.length && targets().length) {
      sendJson(res, 502, { message: "No OpenCode server is reachable." })
      return
    }
    sendJson(res, 200, mergeProjects(entries).map((item) => item.project))
  }

  async function handleSessions(res, searchParams) {
    const provided = searchParams.get("cursor")
    const perServer = provided ? decodeCursor(provided) : {}
    if (provided && !perServer) {
      sendJson(res, 400, { message: "Invalid cursor" })
      return
    }
    const list = targets()
    if (!list.length) {
      sendJson(res, 502, { message: "No OpenCode server is reachable." })
      return
    }
    const entries = []
    await Promise.all(
      list.map(async (target) => {
        if (provided && !perServer[target.id]) return
        const params = new URLSearchParams(searchParams)
        params.delete("cursor")
        if (perServer[target.id]) params.set("cursor", perServer[target.id])
        const search = params.toString() ? `?${params.toString()}` : ""
        try {
          const result = await requestJson(target.endpoint, "/api/session", search, { timeoutMs: SESSION_TIMEOUT })
          if (result.status >= 200 && result.status < 300) entries.push({ serverId: target.id, data: result.body })
        } catch (error) {
          log("warn", "bridge session page failed", { server: target.id, error: errorMessage(error) })
        }
      }),
    )
    const merged = mergeSessionPages(entries)
    for (const item of merged.data) indexSession(item.serverId, item.session)
    if (!entries.length) {
      sendJson(res, 502, { message: "No OpenCode server is reachable." })
      return
    }
    const next = Object.keys(merged.next).length ? { next: encodeCursor(merged.next) } : {}
    sendJson(res, 200, { data: merged.data.map((item) => item.session), cursor: next })
  }

  async function handleActive(res) {
    const entries = await collect("/api/session/active", "")
    if (!entries.length && targets().length) {
      sendJson(res, 502, { message: "No OpenCode server is reachable." })
      return
    }
    const merged = {}
    for (const entry of entries) {
      if (!entry.data || typeof entry.data !== "object" || Array.isArray(entry.data)) continue
      const map = entry.data.data && typeof entry.data.data === "object" && !Array.isArray(entry.data.data)
        ? entry.data.data
        : entry.data
      for (const id of Object.keys(map)) {
        merged[id] = map[id]
        state.sessions.set(id, entry.serverId)
      }
    }
    sendJson(res, 200, { data: merged })
  }

  async function handleArrayCollection(res, pathname, search, shape) {
    const entries = await collect(pathname, search)
    const items = mergeArrays(entries)
    if (shape === "permissions" || shape === "forms") {
      for (const entry of entries) {
        for (const item of itemsOf(entry.data)) {
          const sessionID = item && (item.sessionID || item.sessionId)
          if (typeof sessionID === "string" && sessionID) state.sessions.set(sessionID, entry.serverId)
        }
      }
    }
    if (shape === "saved") {
      for (const entry of entries) {
        for (const item of itemsOf(entry.data)) if (item && item.id) state.saved.set(item.id, entry.serverId)
      }
    }
    if (shape === "pty") {
      for (const entry of entries) {
        for (const item of itemsOf(entry.data)) indexPty(entry.serverId, item)
      }
    }
    if (!entries.length && targets().length) {
      sendJson(res, 502, { message: "No OpenCode server is reachable." })
      return
    }
    sendJson(res, 200, shape === "permissions" || shape === "forms" || shape === "saved" || shape === "pty" ? { data: items } : items)
  }

  async function discoverSession(id) {
    const list = targets()
    const results = await Promise.allSettled(
      list.map((target) =>
        requestJson(target.endpoint, `/api/session/${encodeURIComponent(id)}`, "", { timeoutMs: 5000 }).then((result) => ({
          target,
          result,
        })),
      ),
    )
    for (const item of results) {
      if (item.status !== "fulfilled") continue
      const { target, result } = item.value
      if (result.status < 200 || result.status >= 300) continue
      const session = result.body && result.body.data ? result.body.data : result.body
      if (session && typeof session.id === "string" && session.id === id) {
        indexSession(target.id, session)
        return target
      }
    }
    return undefined
  }

  async function routeSession(req, res, id, pathname, search) {
    let target = targetFor(state.sessions.get(id))
    if (!target) target = await discoverSession(id)
    if (!target) {
      sendJson(res, 404, { message: "This session is no longer available." })
      return
    }
    proxy(req, res, target.endpoint, pathname, search)
  }

  function routePty(req, res, id, pathname, search) {
    const target = targetFor(state.ptys.get(id)) || configTarget()
    if (!target) {
      sendJson(res, 503, { message: "No OpenCode server is reachable." })
      return
    }
    proxy(req, res, target.endpoint, pathname, search)
  }

  async function routeDirectory(req, res, classified, pathname, search) {
    let target
    if (classified.projectID) target = targetFor(state.projects.get(classified.projectID))
    if (!target && classified.directory) target = pickDirectory(classified.directory)
    if (!target) target = configTarget()
    if (!target) {
      sendJson(res, 503, { message: "No OpenCode server is reachable." })
      return
    }
    if (pathname === "/api/location" && req.method === "GET") {
      try {
        const result = await requestJson(target.endpoint, pathname, search, { timeoutMs: SESSION_TIMEOUT })
        const location = result.body && result.body.data && typeof result.body.data === "object" ? result.body.data : result.body
        if (result.status >= 200 && result.status < 300 && location && location.project) {
          indexProject(target.id, location.project)
          if (typeof location.directory === "string") addDirectory(location.directory, target.id)
        }
        sendJson(res, result.status, result.body || {})
      } catch (error) {
        sendJson(res, 502, { message: "The OpenCode server is unavailable." })
      }
      return
    }
    proxy(req, res, target.endpoint, pathname, search)
  }

  async function createSession(req, res, pathname, search, queryDirectory) {
    let body
    try {
      body = (await bufferJson(req, 4 * 1024 * 1024)).body
    } catch (error) {
      sendJson(res, 400, { message: errorMessage(error) })
      return
    }
    const directory = directoryFromBody(body) || queryDirectory
    const target = pickDirectory(directory)
    if (!target) {
      sendJson(res, 503, { message: "No OpenCode server is reachable." })
      return
    }
    try {
      const result = await requestJson(target.endpoint, pathname, search, {
        method: "POST",
        body: JSON.stringify(body || {}),
        headers: { "content-type": "application/json" },
        timeoutMs: 30000,
      })
      const session = result.body && result.body.data ? result.body.data : result.body
      if (result.status >= 200 && result.status < 300) indexSession(target.id, session)
      sendJson(res, result.status, result.body || {})
    } catch (error) {
      sendJson(res, 502, { message: "The OpenCode server is unavailable." })
    }
  }

  async function createPty(req, res, pathname, search, classified) {
    let body
    try {
      body = (await bufferJson(req, 1024 * 1024)).body
    } catch (error) {
      sendJson(res, 400, { message: errorMessage(error) })
      return
    }
    const directory = classified.directory || directoryFromBody(body)
    const target = pickDirectory(directory)
    if (!target) {
      sendJson(res, 503, { message: "No OpenCode server is reachable." })
      return
    }
    try {
      const result = await requestJson(target.endpoint, pathname, search, {
        method: "POST",
        body: JSON.stringify(body || {}),
        headers: { "content-type": "application/json" },
        timeoutMs: 30000,
      })
      const pty = result.body && result.body.data ? result.body.data : result.body
      if (result.status >= 200 && result.status < 300) indexPty(target.id, pty)
      sendJson(res, result.status, result.body || {})
    } catch (error) {
      sendJson(res, 502, { message: "The OpenCode server is unavailable." })
    }
  }

  async function handleCapabilities(res) {
    sendJson(res, 200, {
      bridge: 1,
      name: "opencode-desktop-bridge",
      version: appVersion,
      servers: serversNow().length,
      exposed: targets().length,
    })
  }

  async function handleServers(res) {
    const selected = (() => {
      try {
        return configServer()
      } catch {
        return undefined
      }
    })()
    sendJson(res, 200, {
      data: serversNow().map((server) => ({
        name: server.name,
        connected: Boolean(server.connected),
        configServer: server.id === selected,
      })),
    })
  }

  async function handle(req, res) {
    const url = new URL(req.url || "/", "http://bridge.invalid")
    const pathname = stripBasePath(url.pathname, state.basePath)
    if (!pathname) {
      sendJson(res, 404, { message: "Not found" })
      return
    }
    const classified = classify(req.method || "GET", pathname, url.searchParams)
    if (classified.kind === "pair") {
      await handlePair(req, res, classified.code)
      return
    }
    if (classified.kind === "not-found") {
      sendJson(res, 404, { message: "Not found" })
      return
    }
    const device = authenticate(req, url)
    if (!device) {
      unauthorized(res)
      return
    }
    // The bridge token is ours alone; never forward it upstream, even when the client used the query fallback.
    url.searchParams.delete("auth_token")
    const search = url.search || ""

    switch (classified.kind) {
      case "info":
        await handleInfo(res)
        return
      case "health":
        await handleHealth(res)
        return
      case "event":
        if (state.sse.size >= MAX_SSE_TOTAL || countSse(device.id) >= MAX_SSE_PER_DEVICE) {
          sendJson(res, 429, { message: "Too many open event streams." })
          return
        }
        openEvents(req, res, device)
        return
      case "pair-issue":
        try {
          if (!issuePairing) throw new Error("Pairing is not available.")
          const result = await issuePairing()
          sendJson(res, 200, { code: result.code, expires_in: result.expiresIn || 300 })
        } catch (error) {
          sendJson(res, 503, { message: "OpenCode Desktop is not ready to pair. Try again." })
        }
        return
      case "capabilities":
        await handleCapabilities(res)
        return
      case "servers":
        await handleServers(res)
        return
      case "projects":
        await handleProjects(res, url.searchParams)
        return
      case "project": {
        const target = targetFor(state.projects.get(classified.id)) || configTarget()
        if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
        proxy(req, res, target.endpoint, pathname, search)
        return
      }
      case "sessions":
        if (classified.directory) {
          const target = pickDirectory(classified.directory)
          if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
          proxy(req, res, target.endpoint, pathname, search)
          return
        }
        await handleSessions(res, url.searchParams)
        return
      case "session":
        await routeSession(req, res, classified.id, pathname, search)
        return
      case "session-create":
        await createSession(req, res, pathname, search, classified.directory)
        return
      case "active":
        await handleActive(res)
        return
      case "permissions":
        await handleArrayCollection(res, "/api/permission/request", search, "permissions")
        return
      case "forms":
        await handleArrayCollection(res, "/api/form", search, "forms")
        return
      case "saved-permissions":
        await handleArrayCollection(res, "/api/permission/saved", search, "saved")
        return
      case "saved-permission": {
        const target = targetFor(state.saved.get(classified.id)) || configTarget()
        if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
        proxy(req, res, target.endpoint, pathname, search)
        return
      }
      case "pty-list":
        if (classified.directory) {
          const target = pickDirectory(classified.directory)
          if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
          proxy(req, res, target.endpoint, pathname, search)
          return
        }
        await handleArrayCollection(res, "/api/pty", search, "pty")
        return
      case "pty":
        routePty(req, res, classified.id, pathname, search)
        return
      case "pty-create":
        await createPty(req, res, pathname, search, classified)
        return
      case "location":
      case "directory":
        await routeDirectory(req, res, classified, pathname, search)
        return
      case "config":
      default: {
        const directory = directoryFromQuery(url.searchParams)
        const target = directory ? pickDirectory(directory) : configTarget()
        if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
        proxy(req, res, target.endpoint, pathname, search)
        return
      }
    }
  }

  function openEvents(req, res, device) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    })
    res.flushHeaders()
    const client = {
      res,
      deviceId: device.id,
      upstreams: new Map(),
      closed: false,
      keepalive: undefined,
    }
    state.sse.add(client)
    writeFrame(res, frameFromEvent(connectedEvent()))
    client.keepalive = setInterval(() => {
      if (client.closed || res.destroyed || res.writableEnded) return
      res.write(": keepalive\n\n")
    }, 20000)
    client.keepalive.unref?.()
    const cleanup = () => {
      if (client.closed) return
      client.closed = true
      clearInterval(client.keepalive)
      for (const entry of client.upstreams.values()) {
        clearTimeout(entry.timer)
        entry.request?.destroy()
      }
      client.upstreams.clear()
      state.sse.delete(client)
    }
    res.on("close", cleanup)
    res.on("error", cleanup)
    for (const target of targets()) openUpstreamEvents(client, target)
  }

  function openUpstreamEvents(client, target, attempt = 0) {
    if (client.closed || !state.running) return
    const url = new URL(target.endpoint.url)
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/event`
    url.search = ""
    const lib = url.protocol === "https:" ? require("node:https") : require("node:http")
    const headers = { accept: "text/event-stream", "cache-control": "no-cache", ...(target.endpoint.headers || {}) }
    const controller = new AbortController()
    const connectTimer = setTimeout(() => controller.abort(), 30000)
    const request = lib.request(url, { method: "GET", headers, signal: controller.signal }, (response) => {
      clearTimeout(connectTimer)
      if (response.statusCode !== 200) {
        if (attempt === 0) {
          log("warn", "bridge event stream rejected", { server: target.id, status: response.statusCode })
        }
        response.resume()
        schedule()
        return
      }
      const reader = createSseReader((frame) => {
        learnFrame(target.id, frame)
        writeFrame(client.res, frame)
      })
      response.on("data", (chunk) => reader.push(chunk))
      response.on("end", () => {
        reader.end()
        schedule()
      })
      response.on("error", () => schedule())
      response.on("aborted", () => schedule())
    })
    const entry = { request, timer: undefined, attempt }
    client.upstreams.set(target.id, entry)
    let scheduled = false
    const schedule = () => {
      if (scheduled) return
      scheduled = true
      if (client.closed || !state.running) return
      if (client.upstreams.get(target.id) === entry) client.upstreams.delete(target.id)
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))
      entry.timer = setTimeout(() => {
        if (client.closed || !state.running) return
        const current = targets().find((item) => item.id === target.id)
        if (current) openUpstreamEvents(client, current, attempt + 1)
      }, delay)
      entry.timer.unref?.()
    }
    request.on("error", () => {
      clearTimeout(connectTimer)
      schedule()
    })
    request.end()
  }

  function notifyChanged() {
    const current = new Set(targets().map((target) => target.id))
    const owners = new Set([
      ...state.sessions.values(),
      ...state.ptys.values(),
      ...state.projects.values(),
      ...state.saved.values(),
    ])
    for (const serverId of owners) {
      if (!current.has(serverId) && serverId !== "unknown") dropServer(serverId)
    }
    for (const client of state.sse) {
      if (client.closed) continue
      for (const [serverId, entry] of client.upstreams) {
        if (current.has(serverId)) continue
        clearTimeout(entry.timer)
        entry.request?.destroy()
        client.upstreams.delete(serverId)
      }
      for (const target of targets()) {
        if (!client.upstreams.has(target.id)) openUpstreamEvents(client, target)
      }
      writeFrame(client.res, frameFromEvent(connectedEvent()))
    }
    state.info = undefined
  }

  function revokeDevice(id) {
    devices.revoke(id)
    for (const client of [...state.sse]) {
      if (client.deviceId === id) client.res.destroy()
    }
    for (const entry of [...state.ws]) {
      if (entry.deviceId === id) entry.close()
    }
  }

  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url || "/", "http://bridge.invalid")
    const pathname = stripBasePath(url.pathname, state.basePath)
    if (!pathname) {
      socket.destroy()
      return
    }
    const device = authenticate(req, url)
    if (!device) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="opencode"\r\nContent-Length: 0\r\n\r\n')
      return
    }
    url.searchParams.delete("auth_token")
    const classified = classify("GET", pathname, url.searchParams)
    if (state.ws.size >= MAX_WS_TOTAL || countWs(device.id) >= MAX_WS_PER_DEVICE) {
      socket.end("HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\n\r\n")
      return
    }
    let target
    if (classified.kind === "pty") target = targetFor(state.ptys.get(classified.id)) || configTarget()
    else if (classified.kind === "session") target = targetFor(state.sessions.get(classified.id)) || configTarget()
    else target = configTarget()
    if (!target) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n")
      return
    }
    tunnel(target.endpoint, pathname, url.search, socket, head, req.headers, {
      onSocket: (entry) => {
        const record = { ...entry, deviceId: device.id }
        state.ws.add(record)
        const remove = () => state.ws.delete(record)
        entry.client.on("close", remove)
        entry.client.on("error", remove)
      },
    })
  }

  async function start(input = {}) {
    await stop()
    state.host = input.host || state.host
    state.basePath = input.basePath || ""
    const port = input.port === undefined ? state.port : input.port
    const server = http.createServer((req, res) => {
      Promise.resolve(handle(req, res)).catch((error) => {
        log("error", "bridge request failed", { error: errorMessage(error) })
        if (!res.headersSent && !res.destroyed) sendJson(res, 500, { message: "Bridge error" })
        else res.destroy()
      })
    })
    server.on("upgrade", handleUpgrade)
    server.on("clientError", (error, socket) => {
      log("debug", "bridge client error", { error: errorMessage(error) })
      socket.destroy()
    })
    server.on("connection", (socket) => {
      state.sockets.add(socket)
      socket.on("close", () => state.sockets.delete(socket))
    })
    state.server = server
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener("listening", onListening)
        reject(error)
      }
      const onListening = () => {
        server.removeListener("error", onError)
        const address = server.address()
        state.port = typeof address === "object" && address ? address.port : port
        resolve()
      }
      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(port, state.host)
    })
    state.running = true
    log("info", "bridge listening", { host: state.host, port: state.port, basePath: state.basePath })
    return { host: state.host, port: state.port, basePath: state.basePath }
  }

  async function stop() {
    state.running = false
    for (const client of [...state.sse]) client.res.destroy()
    state.sse.clear()
    for (const entry of [...state.ws]) entry.close()
    state.ws.clear()
    for (const socket of [...state.sockets]) socket.destroy()
    state.sockets.clear()
    for (const entry of state.attempts) entry[1].reset = 0
    const server = state.server
    state.server = undefined
    if (!server) return
    await new Promise((resolve) => {
      server.close(() => resolve())
      setTimeout(resolve, 1000).unref?.()
    })
  }

  return {
    start,
    stop,
    notifyChanged,
    revokeDevice,
    get port() {
      return state.port
    },
    get host() {
      return state.host
    },
    get baseUrl() {
      return publicBase()
    },
    get running() {
      return state.running
    },
  }
}

module.exports = { createBridge }
