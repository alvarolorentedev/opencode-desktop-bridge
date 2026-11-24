"use strict"

const { randomId, sha256, truncate } = require("./util.js")

const TOKEN_PREFIX = "brg1_"
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_DEVICES = 32
const TOUCH_INTERVAL_MS = 60 * 1000

function createDeviceStore(options) {
  const load = options.load
  const save = options.save
  const now = options.now || (() => Date.now())
  const ttl = options.ttlMs || DEFAULT_TTL_MS
  const log = options.log || (() => {})

  function read() {
    const value = load()
    return Array.isArray(value) ? value.filter((item) => item && typeof item.hash === "string") : []
  }

  function write(devices) {
    save(devices)
  }

  function list() {
    return read().map(({ id, name, createdAt, lastSeenAt, expiresAt }) => ({
      id,
      name,
      createdAt,
      lastSeenAt,
      expiresAt,
    }))
  }

  function create(name) {
    const devices = read()
    if (devices.length >= MAX_DEVICES) throw new Error("Too many paired devices. Revoke one first.")
    const token = `${TOKEN_PREFIX}${randomId("", 32)}`
    const record = {
      id: randomId("dev_", 8),
      name: truncate(name || "Device", 60) || "Device",
      hash: sha256(token),
      createdAt: now(),
      lastSeenAt: now(),
      expiresAt: now() + ttl,
    }
    write([...devices, record])
    log("info", "bridge device paired", { device: record.id })
    return { token, device: { id: record.id, name: record.name, createdAt: record.createdAt, expiresAt: record.expiresAt } }
  }

  function verify(token) {
    if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX) || token.length < 20) return undefined
    const hash = sha256(token)
    const devices = read()
    const record = devices.find((item) => item.hash === hash)
    if (!record) return undefined
    if (record.expiresAt <= now()) {
      write(devices.filter((item) => item.id !== record.id))
      log("info", "bridge device expired", { device: record.id })
      return undefined
    }
    if (now() - (record.lastSeenAt || 0) > TOUCH_INTERVAL_MS) {
      record.lastSeenAt = now()
      write(devices)
    }
    return { id: record.id, name: record.name, expiresAt: record.expiresAt }
  }

  function revoke(id) {
    const devices = read()
    const next = devices.filter((item) => item.id !== id)
    if (next.length === devices.length) return false
    write(next)
    log("info", "bridge device revoked", { device: id })
    return true
  }

  function rename(id, name) {
    const devices = read()
    const record = devices.find((item) => item.id === id)
    if (!record) return false
    record.name = truncate(name || record.name, 60) || record.name
    write(devices)
    return true
  }

  return { list, create, verify, revoke, rename }
}

module.exports = { createDeviceStore, TOKEN_PREFIX, MAX_DEVICES }
