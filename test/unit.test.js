"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { classify, stripBasePath, encodeCursor, decodeCursor, directoryFromBody } = require("../src/core/routing.js")
const { createDeviceStore } = require("../src/core/devices.js")
const { mergeProjects, mergeSessionPages, mergeArrays, rewriteInfo } = require("../src/core/merge.js")
const { normalizeConfig, normalizePublicUrl } = require("../src/core/config.js")

test("classify routes the virtual server surface", () => {
  const q = (value) => new URLSearchParams(value)
  assert.equal(classify("GET", "/api/info", q("")).kind, "info")
  assert.equal(classify("GET", "/api/project", q("")).kind, "projects")
  assert.equal(classify("GET", "/api/project/p1", q("")).kind, "project")
  assert.equal(classify("PATCH", "/api/project/p1", q("")).id, "p1")
  assert.equal(classify("GET", "/api/session", q("")).kind, "sessions")
  assert.equal(classify("GET", "/api/session", q("directory=%2Fa")).kind, "sessions")
  assert.equal(classify("GET", "/api/session", q("location%5Bdirectory%5D=%2Fa")).directory, "/a")
  assert.equal(classify("POST", "/api/session", q("")).kind, "session-create")
  assert.equal(classify("GET", "/api/session/active", q("")).kind, "active")
  assert.equal(classify("GET", "/api/session/ses_1", q("")).kind, "session")
  assert.equal(classify("GET", "/api/session/ses_1/message", q("")).id, "ses_1")
  assert.equal(classify("GET", "/api/experimental/session/ses_1/export", q("")).kind, "session")
  assert.equal(classify("GET", "/api/experimental/session/stats", q("")).kind, "config")
  assert.equal(classify("GET", "/api/pty", q("")).kind, "pty-list")
  assert.equal(classify("GET", "/api/pty/pty_1", q("")).kind, "pty")
  assert.equal(classify("GET", "/api/experimental/persistent-pty/pty_1/connect", q("")).kind, "pty")
  assert.equal(classify("GET", "/api/permission/request", q("")).kind, "permissions")
  assert.equal(classify("GET", "/api/form", q("")).kind, "forms")
  assert.equal(classify("GET", "/api/worktree", q("projectID=p1")).projectID, "p1")
  assert.equal(classify("GET", "/api/fs/list", q("path=%2Fa")).kind, "fs-list")
  assert.equal(classify("GET", "/api/fs/list", q("location%5Bdirectory%5D=%2Fa&path=%2Fa")).path, "/a")
  assert.equal(classify("GET", "/api/fs/list", q("location%5Bdirectory%5D=%2Fa")).path, undefined)
  assert.equal(classify("GET", "/api/fs/read/x", q("location%5Bdirectory%5D=%2Fa")).kind, "directory")
  assert.equal(classify("GET", "/api/config", q("")).kind, "config")
  assert.equal(classify("GET", "/api/unknown", q("")).kind, "config")
  assert.equal(classify("GET", "/not-api", q("")).kind, "not-found")
})

test("base path stripping does not match partial prefixes", () => {
  assert.equal(stripBasePath("/bridge/api/info", "/bridge"), "/api/info")
  assert.equal(stripBasePath("/bridge", "/bridge"), "/")
  assert.equal(stripBasePath("/bridgex/api/info", "/bridge"), undefined)
})

test("cursor round trips and rejects foreign values", () => {
  const cursor = encodeCursor({ a: "next-a", b: "next-b" })
  assert.deepEqual(decodeCursor(cursor), { a: "next-a", b: "next-b" })
  assert.equal(decodeCursor("not-a-cursor"), undefined)
  assert.equal(decodeCursor("brg1.not-base64"), undefined)
})

test("directory from body accepts both native shapes", () => {
  assert.equal(directoryFromBody({ location: { directory: "/a" } }), "/a")
  assert.equal(directoryFromBody({ directory: "/b" }), "/b")
  assert.equal(directoryFromBody({}), undefined)
})

test("device tokens are stored as hashes and verified once", () => {
  let stored = []
  const store = createDeviceStore({ load: () => stored, save: (next) => (stored = next), now: () => 1000 })
  const created = store.create("Phone")
  assert.match(created.token, /^brg1_/)
  assert.equal(stored.length, 1)
  assert.notEqual(stored[0].hash, created.token)
  assert.equal(store.verify(created.token).id, created.device.id)
  assert.equal(store.verify("brg1_wrong"), undefined)
  assert.equal(store.list()[0].hash, undefined)
  assert.equal(store.revoke(created.device.id), true)
  assert.equal(store.verify(created.token), undefined)
})

test("merge projects dedupes by worktree and keeps first server", () => {
  const merged = mergeProjects([
    { serverId: "a", data: [{ id: "a1", worktree: "/same" }, { id: "a2", worktree: "/a" }] },
    { serverId: "b", data: [{ id: "b1", worktree: "/same" }, { id: "b2", worktree: "/b" }] },
  ])
  assert.deepEqual(
    merged.map((item) => item.project.id),
    ["a1", "a2", "b2"],
  )
})

test("merge session pages dedupes and keeps per-server cursors", () => {
  const merged = mergeSessionPages([
    { serverId: "a", data: { data: [{ id: "s1" }], cursor: { next: "a-next" } } },
    { serverId: "b", data: { data: [{ id: "s2" }], cursor: {} } },
  ])
  assert.deepEqual(merged.data.map((item) => item.session.id), ["s1", "s2"])
  assert.deepEqual(merged.next, { a: "a-next" })
})

test("array merge unwraps the native data envelope", () => {
  assert.deepEqual(mergeArrays([{ data: { data: [{ id: 1 }] } }, { data: [{ id: 2 }] }]).map((item) => item.id), [1, 2])
})

test("info rewrite hides upstream identity", () => {
  const info = rewriteInfo(
    { version: "2.4.1", pid: 7, hostname: "secret", urls: ["http://10.0.0.1:1"], paths: { tmp: "/private" }, capabilities: { persistentPty: true } },
    "http://bridge.test",
    "0.1.0",
  )
  assert.equal(info.version, "2.4.1")
  assert.equal(info.pid, 0)
  assert.deepEqual(info.urls, ["http://bridge.test"])
  assert.equal(info.hostname, undefined)
  assert.deepEqual(info.paths, { tmp: "/tmp" })
})

test("config normalizes a path prefix and rejects credentials", () => {
  assert.equal(normalizePublicUrl("https://example.test/bridge/").value, "https://example.test/bridge")
  assert.equal(normalizePublicUrl("https://example.test/bridge/").basePath, "/bridge")
  assert.equal(normalizePublicUrl("https://user:pass@example.test").error !== undefined, true)
  assert.equal(normalizePublicUrl("https://example.test/api").error !== undefined, true)
  const normalized = normalizeConfig({ host: "0.0.0.0", port: 5000, publicUrl: "https://example.test/bridge" })
  assert.equal(normalized.value.host, "0.0.0.0")
  assert.equal(normalized.basePath, "/bridge")
})
