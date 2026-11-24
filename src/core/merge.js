"use strict"

const { randomId } = require("./util.js")

function mergeProjects(entries) {
  const byWorktree = new Map()
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.data)) continue
    for (const project of entry.data) {
      if (!project || typeof project !== "object") continue
      const key = project.worktree || project.canonical || project.id
      if (typeof key !== "string" || !key) continue
      if (!byWorktree.has(key)) byWorktree.set(key, { project, serverId: entry.serverId })
    }
  }
  return [...byWorktree.values()]
}

function mergeSessionPages(entries) {
  const byId = new Map()
  const next = {}
  for (const entry of entries) {
    if (!entry || !entry.data || typeof entry.data !== "object") continue
    const items = Array.isArray(entry.data.data) ? entry.data.data : []
    for (const session of items) {
      if (!session || typeof session !== "object" || typeof session.id !== "string") continue
      if (!byId.has(session.id)) byId.set(session.id, { session, serverId: entry.serverId })
    }
    const cursor = entry.data.cursor && typeof entry.data.cursor === "object" ? entry.data.cursor : undefined
    if (cursor && typeof cursor.next === "string" && cursor.next) next[entry.serverId] = cursor.next
  }
  return { data: [...byId.values()], next }
}

function itemsOf(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === "object" && Array.isArray(value.data)) return value.data
  return []
}

function mergeArrays(entries) {
  const result = []
  for (const entry of entries) {
    for (const item of itemsOf(entry && entry.data)) if (item && typeof item === "object") result.push(item)
  }
  return result
}

function rewriteInfo(info, baseUrl, fallbackVersion) {
  const source = info && typeof info === "object" ? info : {}
  return {
    version: typeof source.version === "string" && source.version ? source.version : fallbackVersion,
    pid: 0,
    urls: [baseUrl],
    paths: { tmp: "/tmp" },
  }
}

function connectedEvent() {
  return { id: randomId("evt_", 10), type: "server.connected", data: {} }
}

module.exports = {
  mergeProjects,
  mergeSessionPages,
  mergeArrays,
  itemsOf,
  rewriteInfo,
  connectedEvent,
}
