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
})

const Server = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  connected: Schema.Boolean,
  exposed: Schema.Boolean,
  configServer: Schema.Boolean,
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

const Snapshot = Schema.Struct({
  config: Config,
  status: Status,
  servers: Schema.Array(Server),
  devices: Schema.Array(Device),
  sidecarReady: Schema.Boolean,
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
  expiresAt: Schema.Number,
})

const BridgeIpc = Ipc.define({
  id: "opencode-desktop-bridge.bridge",
  methods: {
    snapshot: { output: Snapshot },
    reportServers: { input: ServerReport },
    setEnabled: { input: Schema.Boolean, output: Snapshot },
    setNetwork: { input: Network, output: Snapshot },
    setHidden: { input: Schema.Array(Schema.String), output: Snapshot },
    setConfigServer: { input: Schema.String, output: Snapshot },
    revokeDevice: { input: Schema.String, output: Snapshot },
    pair: { output: Pairing },
  },
})

module.exports = { BridgeIpc, Config, Device, Snapshot, ServerReport, Network, Pairing, Status }
