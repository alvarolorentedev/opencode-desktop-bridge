"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { readFileSync } = require("node:fs")
const path = require("node:path")

class FakeNode {
  constructor() {
    this.children = []
    this.style = {}
    this.attributes = {}
    this.listeners = {}
  }
  append(child) {
    this.children.push(child)
  }
  removeChild(child) {
    this.children = this.children.filter((item) => item !== child)
  }
  get firstChild() {
    return this.children[0]
  }
  addEventListener(name, fn) {
    this.listeners[name] = fn
  }
  setAttribute(name, value) {
    this.attributes[name] = value
  }
  set onclick(fn) {
    this.listeners.click = fn
  }
  get onclick() {
    return this.listeners.click
  }
  set textContent(value) {
    this.children = []
    this._text = String(value)
  }
  get textContent() {
    return this._text || ""
  }
}

class FakeElement extends FakeNode {}

class FakeText extends FakeNode {}

function installDom() {
  const previous = {
    document: global.document,
    Node: global.Node,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
  }
  global.Node = FakeNode
  global.document = {
    activeElement: undefined,
    createElement: () => new FakeElement(),
    createTextNode: (text) => {
      const node = new FakeText()
      node._text = String(text)
      return node
    },
  }
  global.setInterval = () => 1
  global.clearInterval = () => {}
  return () => Object.assign(global, previous)
}

test("the settings page renders against the desktop UI contract", async () => {
  const restore = installDom()
  try {
    execFileSync(process.execPath, [path.join("scripts", "build.mjs")], { cwd: path.join(__dirname, "..") })
    const code = readFileSync(path.join(__dirname, "..", "dist", "gui-experimental.cjs"), "utf8")
    const schema = require("./schema.js")
    const contributions = []
    const token = { SettingsPage: "SettingsPage", Command: "Command", Style: "Style" }
    const provide = (name) => {
      if (name === "@opencode/plugin/gui") {
        return {
          Plugin: { define: (value) => value },
          Ipc: { define: (value) => value },
          Store: { global: (_schema, initial) => initial },
          ...token,
        }
      }
      if (name === "effect") return { Schema: schema }
      if (name === "solid-js") {
        return {
          createComponent: (component, props) => component(props),
          createEffect: (fn) => fn(),
          onCleanup: () => {},
        }
      }
      return require(name)
    }
    const module = { exports: {} }
    new Function("require", "module", "exports", code)(provide, module, module.exports)
    const definition = module.exports.default || module.exports

    const snapshot = {
      config: { enabled: true, host: "0.0.0.0", port: 47821, publicUrl: "", hiddenServers: [], configServer: "sidecar", remoteEnabled: true, remoteRoute: "bridge-test" },
      status: { state: "running", error: "", baseUrl: "https://bridge-test.tunnel.test", addresses: ["https://bridge-test.tunnel.test", "http://192.168.1.20:47821"], port: 47821 },
      remote: { state: "on", url: "https://bridge-test.tunnel.test", error: "" },
      servers: [
        { id: "sidecar", name: "Desktop", connected: true, exposed: true, configServer: true, source: "desktop" },
        { id: "a", name: "Remote", connected: false, exposed: true, configServer: false, source: "desktop" },
      ],
      devices: [{ id: "dev_1", name: "Phone", createdAt: Date.now() - 5000, lastSeenAt: Date.now(), expiresAt: Date.now() + 5000 }],
      sidecarReady: true,
      adminToken: "adm_test",
      bridgeVersion: "0.1.0",
      appVersion: "2.4.1",
    }
    const main = {
      snapshot: async () => snapshot,
      reportServers: async () => {},
      setEnabled: async () => snapshot,
      setRemote: async () => snapshot,
      setNetwork: async () => snapshot,
      setHidden: async () => snapshot,
      setConfigServer: async () => snapshot,
      revokeDevice: async () => snapshot,
      createDevice: async () => ({ token: "brg1_test", id: "dev_2" }),
      pair: async () => ({
        link: "https://bridge-test.tunnel.test/auth/connect/x",
        command: "opencode pair --url https://bridge-test.tunnel.test",
        code: "x",
        urls: ["https://bridge-test.tunnel.test"],
        qr: "<svg></svg>",
        base: "https://bridge-test.tunnel.test",
        remote: true,
        expiresAt: Date.now() + 1000,
      }),
    }
    const ui = (props) => {
      const node = new FakeElement()
      node.props = props
      const children = props && props.children
      for (const child of Array.isArray(children) ? children : [children]) {
        if (child instanceof FakeNode) node.append(child)
      }
      return node
    }
    const ctx = {
      desktop: true,
      t: (key) => key,
      add: (registry, item) => contributions.push({ registry, item }),
      main: () => main,
      servers: {
        list: () => ["sidecar", "a"],
        get: (id) => (id === "sidecar" ? { name: "Desktop", connected: true, builtin: true, local: true } : { name: "Remote", connected: false, builtin: false, local: false }),
      },
      layout: { settings: () => {} },
      ui: { SettingsLayout: ui, SettingsSection: ui, SettingsRow: ui },
    }
    definition.setup(ctx)
    await Promise.resolve()
    await Promise.resolve()

    const page = contributions.find((entry) => entry.registry === token.SettingsPage)
    assert.ok(page, "settings page contribution")
    const rendered = page.item.render({})
    assert.ok(rendered instanceof FakeNode)
    assert.ok(rendered.children.length > 0)
    assert.equal(typeof page.item.title, "string")
    assert.ok(findText(rendered, "Pair over the internet"), "remote pairing button")
    assert.ok(findText(rendered, "Pair on this network"), "local pairing button")

    const command = contributions.find((entry) => entry.registry === token.Command)
    assert.ok(command, "command contribution")
    assert.equal(typeof command.item.run, "function")

    const style = contributions.find((entry) => entry.registry === token.Style)
    assert.ok(style, "style contribution")
    assert.match(style.item, /\.odb/)
  } finally {
    restore()
  }
})

function findText(node, text) {
  if (!node) return undefined
  const children = node.children || []
  if (children.some((child) => child._text === text) && node.listeners && typeof node.listeners.click === "function") {
    return node
  }
  for (const child of children) {
    const found = findText(child, text)
    if (found) return found
  }
  return undefined
}

test("the web settings page renders and syncs this browser's servers", async () => {
  const restore = installDom()
  const previousFetch = global.fetch
  try {
    execFileSync(process.execPath, [path.join("scripts", "build.mjs")], { cwd: path.join(__dirname, "..") })
    const code = readFileSync(path.join(__dirname, "..", "dist", "gui-experimental.cjs"), "utf8")
    const schema = require("./schema.js")
    const contributions = []
    const token = { SettingsPage: "SettingsPage", Command: "Command", Style: "Style" }
    const provide = (name) => {
      if (name === "@opencode/plugin/gui") {
        return {
          Plugin: { define: (value) => value },
          Ipc: { define: (value) => value },
          Store: { global: (_schema, initial) => initial },
          ...token,
        }
      }
      if (name === "effect") return { Schema: schema }
      if (name === "solid-js") {
        return {
          createComponent: (component, props) => component(props),
          createEffect: (fn) => fn(),
          onCleanup: () => {},
        }
      }
      return require(name)
    }
    const module = { exports: {} }
    new Function("require", "module", "exports", code)(provide, module, module.exports)
    const definition = module.exports.default || module.exports

    const calls = []
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "sidecar" }] }) }
    }

    const state = { url: "http://127.0.0.1:47821", token: "adm_test" }
    const servers = new Map([
      ["sidecar", { name: "Desktop", url: "http://127.0.0.1:49374", password: "pw", builtin: true }],
      ["bridge", { name: "Bridge", url: "http://127.0.0.1:47821" }],
    ])
    const ui = (props) => {
      const node = new FakeElement()
      const children = props && props.children
      for (const child of Array.isArray(children) ? children : [children]) {
        if (child instanceof FakeNode) node.append(child)
      }
      return node
    }
    const ctx = {
      desktop: false,
      t: (key) => key,
      add: (registry, item) => contributions.push({ registry, item }),
      stores: {
        web: {
          value: state,
          update: (fn) => fn(state),
        },
      },
      servers: {
        list: () => [...servers.keys()],
        get: (id) => servers.get(id),
      },
      layout: { settings: () => {} },
      ui: { SettingsLayout: ui, SettingsSection: ui, SettingsRow: ui },
    }

    definition.setup(ctx)
    const page = contributions.find((entry) => entry.registry === token.SettingsPage)
    assert.ok(page, "web settings page contribution")
    assert.equal(page.item.id, "desktop-bridge-web")
    const rendered = page.item.render({})
    assert.ok(rendered instanceof FakeNode)

    const sync = findText(rendered, "Sync this browser's servers")
    assert.ok(sync, "sync button")
    await sync.listeners.click()

    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /\/bridge\/v1\/admin\/servers\/web$/)
    assert.equal(calls[0].options.headers.authorization, "Bearer adm_test")
    assert.deepEqual(JSON.parse(calls[0].options.body).servers, [
      { name: "Desktop", url: "http://127.0.0.1:49374", password: "pw" },
    ])
  } finally {
    global.fetch = previousFetch
    restore()
  }
})
