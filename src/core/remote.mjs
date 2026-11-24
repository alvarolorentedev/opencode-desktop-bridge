/**
 * The internet tunnel route for the bridge. Runs in the OpenCode server process
 * (the plugin's server entry), where the plugin's dependencies are installed.
 * The tunnel is the same device tunnel `opencode pair --remote` uses: the
 * native service keeps its own route, the bridge claims another one.
 */

import { randomBytes } from "node:crypto"

const ROUTE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const HOST = /^[a-zA-Z0-9.:[\]-]+$/
const PROFILE = "default"

export function routeName(value) {
  if (typeof value === "string" && value.length <= 63 && ROUTE.test(value)) return value
  return `bridge-${randomBytes(8).toString("hex")}`
}

function validTarget(host, port) {
  if (typeof host !== "string" || !host || host.length > 255 || !HOST.test(host)) return false
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false
  return true
}

export function createRemote(options = {}) {
  const createClient = options.createClient
  const log = options.log || (() => {})
  const profile = options.profile || PROFILE

  let client
  let connection
  let route
  let target
  let state = { state: "off", url: "", error: "" }
  let queue = Promise.resolve()

  function urlOf(conn, name) {
    const fromConnection = conn.urls && conn.urls[name]
    if (typeof fromConnection === "string" && fromConnection) return fromConnection
    const hostname = conn.tunnel && conn.tunnel.hostname
    return hostname ? `https://${name}.${hostname}` : ""
  }

  async function closeCurrent() {
    const conn = connection
    const current = client
    connection = undefined
    client = undefined
    route = undefined
    target = undefined
    if (conn) await Promise.resolve(conn.close()).catch(() => {})
    if (current) await Promise.resolve(current.dispose()).catch(() => {})
  }

  async function attach(input = {}) {
    const nextRoute = routeName(input.route)
    const host = typeof input.host === "string" && input.host ? input.host : "127.0.0.1"
    const port = Number(input.port)
    if (!validTarget(host, port)) throw new Error("The bridge address is not valid.")
    const nextTarget = `${host}:${port}`

    if (connection && route === nextRoute) {
      if (target !== nextTarget) {
        target = nextTarget
        await connection.setRoutes({ [route]: target })
      }
      state = { state: "on", url: urlOf(connection, route), error: "" }
      return { url: state.url, route }
    }

    await closeCurrent()
    state = { state: "starting", url: "", error: "" }
    try {
      const nextClient = await createClient()
      client = nextClient
      const nextConnection = await nextClient.tunnel.connect({
        profile,
        routes: { [nextRoute]: nextTarget },
        onRouteConflict: "fail",
        onEvent: (event) => {
          if (event && event.type === "route-conflict") log("warn", "remote route conflict", { route: nextRoute })
        },
      })
      connection = nextConnection
      route = nextRoute
      target = nextTarget
      state = { state: "on", url: urlOf(nextConnection, nextRoute), error: "" }
      Promise.resolve(nextConnection.closed).then(
        () => {
          if (connection !== nextConnection) return
          connection = undefined
          const currentClient = client
          client = undefined
          route = undefined
          target = undefined
          state = { state: "error", url: "", error: "The internet tunnel closed. Try again." }
          if (currentClient) Promise.resolve(currentClient.dispose()).catch(() => {})
          log("warn", "remote tunnel closed")
        },
        (error) => {
          if (connection !== nextConnection) return
          connection = undefined
          const currentClient = client
          client = undefined
          route = undefined
          target = undefined
          state = { state: "error", url: "", error: error instanceof Error ? error.message : String(error) }
          if (currentClient) Promise.resolve(currentClient.dispose()).catch(() => {})
          log("warn", "remote tunnel failed", { error: state.error })
        },
      )
      return { url: state.url, route }
    } catch (error) {
      state = { state: "error", url: "", error: error instanceof Error ? error.message : String(error) }
      log("warn", "remote attach failed", { error: state.error })
      await closeCurrent()
      throw error
    }
  }

  async function detach() {
    await closeCurrent()
    state = { state: "off", url: "", error: "" }
  }

  function enqueue(run) {
    const next = queue.then(run, run)
    queue = next.catch(() => {})
    return next
  }

  return {
    attach(input) {
      return enqueue(() => attach(input))
    },
    detach() {
      return enqueue(() => detach())
    },
    status() {
      return { ...state }
    },
  }
}
