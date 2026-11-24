"use strict"

const { requestJson } = require("./http.js")

async function issuePairing(endpoint) {
  if (!endpoint || !endpoint.url) throw new Error("OpenCode Desktop's server is not ready.")
  const result = await requestJson(endpoint, "/api/pair", "", { method: "POST", timeoutMs: 10000 })
  if (result.status < 200 || result.status >= 300 || !result.body || typeof result.body.code !== "string") {
    throw new Error("OpenCode Desktop could not create a pairing code.")
  }
  return {
    code: result.body.code,
    expiresIn: typeof result.body.expires_in === "number" ? result.body.expires_in : 300,
  }
}

async function redeemPairing(endpoint, code) {
  if (!endpoint || !endpoint.url) throw new Error("OpenCode Desktop's server is not ready.")
  const result = await requestJson(endpoint, `/auth/connect/${encodeURIComponent(code)}`, "", {
    headers: { accept: "application/json" },
    timeoutMs: 4000,
  })
  return result.status >= 200 && result.status < 300 && Boolean(result.body && typeof result.body.token === "string")
}

module.exports = { issuePairing, redeemPairing }
