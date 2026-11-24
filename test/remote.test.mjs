import test from "node:test"
import assert from "node:assert/strict"
import { createRemote, routeName } from "../src/core/remote.mjs"
import { BridgeRemote, createHandlers, makeQr } from "../src/server-rpc.mjs"

function fakeClient() {
  const state = { routes: [], closed: false, disposed: false, fail: undefined }
  const client = {
    tunnel: {
      connect: async ({ routes }) => {
        if (state.fail) throw state.fail
        state.routes.push(routes)
        const urls = Object.fromEntries(Object.keys(routes).map((name) => [name, `https://${name}.tunnel.test`]))
        let resolveClosed
        const closed = new Promise((resolve) => {
          resolveClosed = resolve
        })
        const connection = {
          urls,
          tunnel: { hostname: "tunnel.test" },
          setRoutes: async (next) => {
            state.routes.push(next)
            for (const key of Object.keys(urls)) delete urls[key]
            for (const [key] of Object.entries(next)) urls[key] = `https://${key}.tunnel.test`
          },
          closed,
          close: async () => {
            state.closed = true
            resolveClosed()
          },
        }
        state.connection = connection
        state.resolveClosed = resolveClosed
        return connection
      },
    },
    dispose: async () => {
      state.disposed = true
    },
  }
  return { client, state }
}

test("remote attaches a route, reuses it, updates its port and detaches", async () => {
  const { client, state } = fakeClient()
  const remote = createRemote({ createClient: async () => client })
  const attached = await remote.attach({ host: "127.0.0.1", port: 47821, route: "bridge-test" })
  assert.deepEqual(attached, { url: "https://bridge-test.tunnel.test", route: "bridge-test" })
  assert.deepEqual(remote.status(), { state: "on", url: "https://bridge-test.tunnel.test", error: "" })

  const moved = await remote.attach({ host: "127.0.0.1", port: 5000, route: "bridge-test" })
  assert.deepEqual(moved, { url: "https://bridge-test.tunnel.test", route: "bridge-test" })
  assert.deepEqual(state.routes.at(-1), { "bridge-test": "127.0.0.1:5000" })

  await remote.detach()
  assert.deepEqual(remote.status(), { state: "off", url: "", error: "" })
  assert.equal(state.closed, true)
  assert.equal(state.disposed, true)
})

test("remote creates a route when none is stored and reports failures", async () => {
  const generated = routeName("")
  assert.match(generated, /^bridge-[a-f0-9]{16}$/)
  assert.equal(routeName("bridge-ok"), "bridge-ok")
  assert.notEqual(routeName("bad route"), "bad route")

  const { client, state } = fakeClient()
  state.fail = new Error("route_conflict")
  const remote = createRemote({ createClient: async () => client })
  await assert.rejects(() => remote.attach({ host: "127.0.0.1", port: 47821, route: "" }), /route_conflict/)
  assert.equal(remote.status().state, "error")
  assert.match(remote.status().error, /route_conflict/)
  assert.equal(state.disposed, true)
})

test("the tunnel closing moves the remote to an error", async () => {
  const { client, state } = fakeClient()
  const remote = createRemote({ createClient: async () => client })
  await remote.attach({ host: "127.0.0.1", port: 47821, route: "bridge-test" })
  state.resolveClosed()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(remote.status().state, "error")
  assert.match(remote.status().error, /closed/)
})

test("the server handlers expose attach, detach, status and a QR", async () => {
  const calls = []
  const fake = {
    attach: async (input) => {
      calls.push(["attach", input])
      return { url: "https://bridge-test.tunnel.test", route: input.route }
    },
    detach: async () => calls.push(["detach"]),
    status: () => ({ state: "on", url: "https://bridge-test.tunnel.test", error: "" }),
  }
  const handlers = createHandlers(fake, (text) => `<svg>${text}</svg>`)
  assert.deepEqual(await handlers.attach({ host: "127.0.0.1", port: 1, route: "bridge-test" }), {
    url: "https://bridge-test.tunnel.test",
    route: "bridge-test",
  })
  assert.deepEqual(await handlers.status(), { state: "on", url: "https://bridge-test.tunnel.test", error: "" })
  assert.deepEqual(await handlers.qr({ text: "payload" }), { svg: "<svg>payload</svg>" })
  assert.deepEqual(await handlers.detach(), { ok: true })
  assert.deepEqual(calls.at(-1), ["detach"])
  assert.equal(BridgeRemote.id, "desktop-bridge.remote")
  assert.ok(BridgeRemote.methods.attach.output)
})

test("the QR encoder produces an SVG", () => {
  const svg = makeQr(JSON.stringify({ code: "abc", urls: ["https://bridge-test.tunnel.test"] }))
  assert.match(svg, /^<svg/)
  assert.match(svg, /<\/svg>$/)
  assert.throws(() => makeQr(""), /Invalid pairing payload/)
})
