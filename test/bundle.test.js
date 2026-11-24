"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { existsSync, readFileSync } = require("node:fs")
const path = require("node:path")

test("the built GUI bundle evaluates with the host's provided modules", () => {
  execFileSync(process.execPath, [path.join("scripts", "build.mjs")], { cwd: path.join(__dirname, "..") })
  const code = readFileSync(path.join(__dirname, "..", "dist", "gui-experimental.cjs"), "utf8")
  const schema = new Proxy(function schema() {}, { get: () => () => undefined })
  const provide = (name) => {
    if (name === "@opencode/plugin/gui") {
      return {
        Plugin: { define: (value) => value },
        Ipc: { define: (value) => value },
        Store: { global: (_schema, initial) => initial },
        SettingsPage: {},
        Command: {},
        Style: {},
      }
    }
    if (name === "effect") return { Schema: schema }
    if (name === "solid-js") {
      return {
        createComponent: (component, props) => {
          try {
            return component(props)
          } catch {
            return undefined
          }
        },
        createEffect: (fn) => {
          try {
            fn()
          } catch {
            // The fake host has no owner; a setup failure is not a bundle failure.
          }
        },
        onCleanup: () => {},
      }
    }
    return require(name)
  }
  const module = { exports: {} }
  new Function("require", "module", "exports", code)(provide, module, module.exports)
  const definition = module.exports.default || module.exports
  assert.equal(typeof definition.setup, "function")
  assert.equal(typeof definition.main, "function")
  assert.equal(typeof definition.i18n.en.title, "string")
  assert.equal(definition.i18n.en.title, "Desktop Bridge")
})

test("the package exposes the TUI part", () => {
  const pkg = require("../package.json")
  assert.equal(pkg.exports["./tui"], "./src/tui.ts")
  assert.equal(pkg.files.includes("src/tui.ts"), true)
  assert.equal(existsSync(path.join(__dirname, "..", "src", "tui.ts")), true)
})

test("the package exposes the server tunnel part", () => {
  const pkg = require("../package.json")
  assert.equal(pkg.exports["./server"], "./src/server.mjs")
  for (const file of ["src/server.mjs", "src/server-rpc.mjs", "src/core/remote.mjs"]) {
    assert.equal(pkg.files.includes(file), true)
    assert.equal(existsSync(path.join(__dirname, "..", file)), true)
  }
  assert.equal(pkg.dependencies["@opentunnel/client"], "0.7.0")
  assert.equal(typeof pkg.dependencies["qrcode-generator"], "string")
})
