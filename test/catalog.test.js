"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { createCatalog, normalizeUrl, manualId } = require("../src/core/catalog.js")

test("catalog merges sources, dedupes by URL, hides and selects config", () => {
  let hidden = []
  let config = "a"
  const catalog = createCatalog({
    hidden: () => hidden,
    configServer: () => config,
    sources: [
      { id: "desktop", entries: () => [{ id: "a", name: "A", url: "http://a.test/", builtin: true, connected: true }] },
      { id: "tui", entries: () => [{ id: "b", name: "B", url: "http://b.test", headers: { authorization: "x" } }] },
      { id: "web", entries: () => [{ id: "c", name: "C", url: "http://a.test" }] },
    ],
  })

  assert.equal(catalog.configServer(), "a")
  assert.deepEqual(catalog.servers().map((server) => server.id), ["a", "b"])
  assert.deepEqual(catalog.resolve("b"), { url: "http://b.test", headers: { authorization: "x" } })
  assert.equal(catalog.resolve("c"), undefined)

  hidden = ["a"]
  assert.deepEqual(catalog.servers().map((server) => server.id), ["b"])
  assert.equal(catalog.configServer(), "b")

  hidden = []
  config = "b"
  assert.equal(catalog.configServer(), "b")
  assert.deepEqual(
    catalog.snapshot().map((server) => [server.id, server.source, server.exposed, server.configServer]),
    [
      ["a", "desktop", true, false],
      ["b", "tui", true, true],
    ],
  )
})

test("catalog keeps source IDs unique", () => {
  const catalog = createCatalog({
    sources: [
      { id: "desktop", entries: () => [{ id: "x", name: "A", url: "http://a.test" }] },
      { id: "tui", entries: () => [{ id: "x", name: "B", url: "http://b.test" }] },
    ],
  })
  assert.deepEqual(catalog.snapshot().map((server) => server.id), ["x", "tui:x"])
  assert.equal(catalog.resolve("tui:x").url, "http://b.test")
})

test("catalog URL helpers", () => {
  assert.equal(normalizeUrl("http://host:1/"), "http://host:1")
  assert.equal(normalizeUrl("https://host/path/"), "https://host/path")
  assert.equal(normalizeUrl("ftp://host"), undefined)
  assert.equal(normalizeUrl("http://user:pass@host"), undefined)
  assert.equal(normalizeUrl("not a url"), undefined)
  assert.equal(manualId("tui", "http://host:1"), manualId("tui", "http://host:1"))
  assert.notEqual(manualId("tui", "http://host:1"), manualId("web", "http://host:1"))
})
