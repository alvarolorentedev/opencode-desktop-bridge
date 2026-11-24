"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const net = require("node:net")
const { createBridge } = require("../src/core/bridge.js")
const { createDeviceStore } = require("../src/core/devices.js")
const { listen, close, request, basic } = require("./helpers.js")

function tcpServer(onSocket) {
  const server = net.createServer(onSocket)
  return server
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => resolve(socket))
    socket.on("error", reject)
  })
}

function readUntil(socket, marker, timeout = 3000) {
  return new Promise((resolve, reject) => {
    let data = ""
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${marker}`)), timeout)
    const onData = (chunk) => {
      data += chunk.toString("utf8")
      if (data.includes(marker)) {
        clearTimeout(timer)
        socket.removeListener("data", onData)
        resolve(data)
      }
    }
    socket.on("data", onData)
  })
}

test("websocket upgrades tunnel through the bridge and die on revoke", async (t) => {
  const seen = []
  const upstream = tcpServer((socket) => {
    let buffer = ""
    const onData = (chunk) => {
      buffer += chunk.toString("utf8")
      if (!buffer.includes("\r\n\r\n")) return
      socket.removeListener("data", onData)
      seen.push(buffer)
      if (!/upgrade:\s*websocket/i.test(buffer)) {
        socket.end("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
        return
      }
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
      socket.on("data", (data) => socket.write(data))
    }
    socket.on("data", onData)
  })
  const upstreamPort = await listen(upstream)
  let stored = []
  const devices = createDeviceStore({ load: () => stored, save: (next) => (stored = next) })
  let bridge
  bridge = createBridge({
    resolveServer: () => ({ url: `http://127.0.0.1:${upstreamPort}`, headers: { authorization: "Basic dXBzdHJlYW0=" } }),
    servers: () => [{ id: "a", name: "A", connected: true }],
    configServer: () => "a",
    redeem: async () => true,
    devices,
    appVersion: "2.4.1",
    baseUrl: () => `http://127.0.0.1:${bridge.port}`,
    log: () => {},
  })
  await bridge.start({ host: "127.0.0.1", port: 0 })
  t.after(async () => {
    await bridge.stop()
    await close(upstream)
  })

  const paired = await request(bridge.port, "/auth/connect/good")
  assert.equal(paired.status, 200)
  const token = paired.body.token

  const socket = await connect(bridge.port)
  socket.write(
    [
      "GET /api/pty/pty-1/connect?directory=%2Fa HTTP/1.1",
      "Host: bridge",
      "Upgrade: websocket",
      "Connection: Upgrade",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version: 13",
      `Authorization: ${basic(token)}`,
      "",
      "",
    ].join("\r\n"),
  )
  const response = await readUntil(socket, "\r\n\r\n")
  assert.match(response, /101 Switching Protocols/)
  assert.ok(seen.some((line) => line.includes("GET /api/pty/pty-1/connect?directory=%2Fa HTTP/1.1")))
  assert.ok(seen.some((line) => /authorization:\s*Basic dXBzdHJlYW0=/i.test(line)))

  socket.write("ping")
  const echoed = await readUntil(socket, "ping")
  assert.match(echoed, /ping/)

  const closed = new Promise((resolve) => socket.once("close", resolve))
  bridge.revokeDevice(devices.list()[0].id)
  await closed
})
