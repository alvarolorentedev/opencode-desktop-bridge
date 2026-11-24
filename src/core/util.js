"use strict"

const crypto = require("node:crypto")

function randomId(prefix, bytes = 16) {
  return `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function joinPath(base, pathname) {
  const left = base === "/" ? "" : base.replace(/\/+$/, "")
  const right = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `${left}${right}` || "/"
}

function parseUrl(input) {
  try {
    return new URL(input, "http://bridge.invalid")
  } catch {
    return undefined
  }
}

function truncate(value, length) {
  const text = String(value ?? "")
  return text.length > length ? text.slice(0, length) : text
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

module.exports = { randomId, sha256, joinPath, parseUrl, truncate, errorMessage }
