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
    createTextNode: () => new FakeText(),
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
    const schema = new Proxy(function schema() {}, { get: () => () => undefined })
    const contributions = []
    const token = { SettingsPage: "SettingsPage", Command: "Command", Style: "Style" }
    const provide = (name) => {
      if (name === "@opencode/plugin/gui") {
        return {
          Plugin: { define: (value) => value },
          Ipc: { define: (value) => value },
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
      config: { enabled: true, host: "0.0.0.0", port: 47821, publicUrl: "", hiddenServers: [], configServer: "sidecar" },
      status: { state: "running", error: "", baseUrl: "http://192.168.1.20:47821", addresses: ["http://192.168.1.20:47821"], port: 47821 },
      servers: [
        { id: "sidecar", name: "Desktop", connected: true, exposed: true, configServer: true },
        { id: "a", name: "Remote", connected: false, exposed: true, configServer: false },
      ],
      devices: [{ id: "dev_1", name: "Phone", createdAt: Date.now() - 5000, lastSeenAt: Date.now(), expiresAt: Date.now() + 5000 }],
      sidecarReady: true,
      bridgeVersion: "0.1.0",
      appVersion: "2.4.1",
    }
    const main = {
      snapshot: async () => snapshot,
      reportServers: async () => {},
      setEnabled: async () => snapshot,
      setNetwork: async () => snapshot,
      setHidden: async () => snapshot,
      setConfigServer: async () => snapshot,
      revokeDevice: async () => snapshot,
      pair: async () => ({ link: "http://192.168.1.20:47821/auth/connect/x", command: "opencode pair --url http://192.168.1.20:47821", expiresAt: Date.now() + 1000 }),
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
