"use strict"

const SESSION_RESERVED = new Set(["active", "stats", "import"])
const SESSION_ROUTE = /^\/api\/session\/([^/]+)(\/.*)?$/
const PROJECT_ROUTE = /^\/api\/project\/([^/]+)(\/.*)?$/
const PTY_ROUTE = /^\/api\/pty\/([^/]+)(\/.*)?$/
const PERSISTENT_PTY_ROUTE = /^\/api\/experimental\/persistent-pty\/([^/]+)(\/.*)?$/
const EXPERIMENTAL_SESSION_ROUTE = /^\/api\/experimental\/session\/([^/]+)(\/.*)?$/
const PAIR_ROUTE = /^\/auth\/connect\/([^/]+)$/
const SAVED_PERMISSION_ROUTE = /^\/api\/permission\/saved\/([^/]+)$/

function stripBasePath(pathname, basePath) {
  if (!basePath) return pathname
  if (pathname === basePath) return "/"
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length)
  return undefined
}

function queryValue(searchParams, name) {
  return searchParams.get(name) || undefined
}

function directoryFromQuery(searchParams) {
  return queryValue(searchParams, "location[directory]") || queryValue(searchParams, "directory")
}

function decode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function directoryFromBody(body) {
  if (!body || typeof body !== "object") return undefined
  const location = body.location && typeof body.location === "object" ? body.location : undefined
  const value = (location && location.directory) || body.directory
  if (typeof value !== "string" || !value.trim()) return undefined
  return value
}

function classify(method, pathname, searchParams) {
  if (pathname === "/api/info") return { kind: "info" }
  if (pathname === "/api/health") return { kind: "health" }
  if (pathname === "/api/event") return { kind: "event" }
  if (pathname === "/bridge/v1/capabilities") return { kind: "capabilities" }
  if (pathname === "/bridge/v1/servers") return { kind: "servers" }

  const pair = PAIR_ROUTE.exec(pathname)
  if (pair && method === "GET") return { kind: "pair", code: decode(pair[1]) }
  if (pathname === "/api/pair" && method === "POST") return { kind: "pair-issue" }

  if (pathname === "/api/session") {
    if (method === "POST") return { kind: "session-create", directory: directoryFromQuery(searchParams) }
    const directory = directoryFromQuery(searchParams)
    if (directory) return { kind: "sessions", directory }
    return { kind: "sessions" }
  }

  const session = SESSION_ROUTE.exec(pathname)
  if (session) {
    const id = decode(session[1])
    if (SESSION_RESERVED.has(id)) {
      if (id === "active" && method === "GET") return { kind: "active" }
      return { kind: "config" }
    }
    return { kind: "session", id }
  }

  if (pathname === "/api/pty") {
    const directory = directoryFromQuery(searchParams)
    if (method === "POST") return { kind: "pty-create", directory }
    return directory ? { kind: "pty-list", directory } : { kind: "pty-list" }
  }

  const pty = PTY_ROUTE.exec(pathname)
  if (pty) return { kind: "pty", id: decode(pty[1]) }

  const persistentPty = PERSISTENT_PTY_ROUTE.exec(pathname)
  if (persistentPty) return { kind: "pty", id: decode(persistentPty[1]) }

  const experimentalSession = EXPERIMENTAL_SESSION_ROUTE.exec(pathname)
  if (experimentalSession) {
    const id = decode(experimentalSession[1])
    if (id !== "stats") return { kind: "session", id }
  }

  if (pathname === "/api/project" && method === "GET") return { kind: "projects" }
  const project = PROJECT_ROUTE.exec(pathname)
  if (project) return { kind: "project", id: decode(project[1]) }
  if (pathname === "/api/location" && method === "GET") {
    return { kind: "location", directory: directoryFromQuery(searchParams) }
  }
  if (pathname === "/api/permission/request" && method === "GET") return { kind: "permissions" }
  if (pathname === "/api/form" && method === "GET") return { kind: "forms" }
  if (pathname === "/api/permission/saved") {
    return method === "GET" ? { kind: "saved-permissions" } : { kind: "config" }
  }
  const saved = SAVED_PERMISSION_ROUTE.exec(pathname)
  if (saved) return { kind: "saved-permission", id: decode(saved[1]) }

  if (pathname === "/api/fs/list") {
    return { kind: "fs-list", directory: directoryFromQuery(searchParams), path: queryValue(searchParams, "path") }
  }
  if (pathname.startsWith("/api/fs/") || pathname.startsWith("/api/experimental/fs/")) {
    return { kind: "directory", directory: directoryFromQuery(searchParams) }
  }
  if (pathname.startsWith("/api/vcs")) {
    return { kind: "directory", directory: directoryFromQuery(searchParams) }
  }
  if (pathname.startsWith("/api/worktree")) {
    return {
      kind: "directory",
      directory: directoryFromQuery(searchParams),
      projectID: queryValue(searchParams, "projectID"),
    }
  }

  if (pathname.startsWith("/api/")) return { kind: "config" }
  return { kind: "not-found" }
}

function isUpgradePath(pathname) {
  return pathname.startsWith("/api/")
}

function encodeCursor(values) {
  return `brg1.${Buffer.from(JSON.stringify(values)).toString("base64url")}`
}

function decodeCursor(value) {
  if (typeof value !== "string" || !value.startsWith("brg1.")) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value.slice(5), "base64url").toString("utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    const result = {}
    for (const [key, cursor] of Object.entries(parsed)) {
      if (typeof cursor === "string" && cursor) result[key] = cursor
    }
    return result
  } catch {
    return undefined
  }
}

module.exports = {
  stripBasePath,
  classify,
  isUpgradePath,
  directoryFromQuery,
  directoryFromBody,
  encodeCursor,
  decodeCursor,
}
