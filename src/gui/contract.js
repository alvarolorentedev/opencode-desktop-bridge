"use strict"

const { Ipc } = require("@opencode/plugin/gui")
const { Schema } = require("effect")

const Config = Schema.Struct({
  enabled: Schema.Boolean,
  host: Schema.String,
  port: Schema.Number,
  publicUrl: Schema.String,
  hiddenServers: Schema.Array(Schema.String),
  configServer: Schema.String,
  remoteEnabled: Schema.optional(Schema.Boolean),
  remoteRoute: Schema.optional(Schema.String),
})

const Server = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  connected: Schema.Boolean,
  exposed: Schema.Boolean,
  configServer: Schema.Boolean,
  source: Schema.String,
})

const Device = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.Number,
  lastSeenAt: Schema.Number,
  expiresAt: Schema.Number,
})

const Status = Schema.Struct({
  state: Schema.String,
  error: Schema.String,
  baseUrl: Schema.String,
  addresses: Schema.Array(Schema.String),
  port: Schema.Number,
})

const Remote = Schema.Struct({
  state: Schema.String,
  url: Schema.String,
  error: Schema.String,
})

const Snapshot = Schema.Struct({
  config: Config,
  status: Status,
  remote: Remote,
  servers: Schema.Array(Server),
  devices: Schema.Array(Device),
  sidecarReady: Schema.Boolean,
  adminToken: Schema.String,
  bridgeVersion: Schema.String,
  appVersion: Schema.String,
})

const ServerReport = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    connected: Schema.Boolean,
    builtin: Schema.Boolean,
    local: Schema.Boolean,
  }),
)

const Network = Schema.Struct({
  host: Schema.String,
  port: Schema.Number,
  publicUrl: Schema.String,
})

const Pairing = Schema.Struct({
  link: Schema.String,
  command: Schema.String,
  code: Schema.String,
  urls: Schema.Array(Schema.String),
  qr: Schema.String,
  base: Schema.String,
  remote: Schema.Boolean,
  expiresAt: Schema.Number,
})

const PairInput = Schema.Struct({
  mode: Schema.Union([Schema.Literal("remote"), Schema.Literal("local")]),
})

const Token = Schema.Struct({
  token: Schema.String,
  id: Schema.String,
})

const BridgeIpc = Ipc.define({
  // The GUI plugin id is the package name, and ctx.provide rejects ids outside it.
  id: "@alvarolorentedev/opencode-desktop-bridge.bridge",
  methods: {
    snapshot: { output: Snapshot },
    reportServers: { input: ServerReport },
    setEnabled: { input: Schema.Boolean, output: Snapshot },
    setRemote: { input: Schema.Boolean, output: Snapshot },
    setNetwork: { input: Network, output: Snapshot },
    setHidden: { input: Schema.Array(Schema.String), output: Snapshot },
    setConfigServer: { input: Schema.String, output: Snapshot },
    revokeDevice: { input: Schema.String, output: Snapshot },
    createDevice: { input: Schema.String, output: Token },
    pair: { input: PairInput, output: Pairing },
  },
})

module.exports = { BridgeIpc, Config, Device, Snapshot, ServerReport, Network, Pairing, PairInput, Status, Token, Remote }
