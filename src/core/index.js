"use strict"

const { createBridge } = require("./bridge.js")
const { createDeviceStore } = require("./devices.js")
const { createServerRegistry } = require("./registry.js")
const { issuePairing, redeemPairing } = require("./native.js")
const { normalizeConfig, reachableAddresses, addressHint, ipv4Addresses } = require("./config.js")

module.exports = {
  createBridge,
  createDeviceStore,
  createServerRegistry,
  issuePairing,
  redeemPairing,
  normalizeConfig,
  reachableAddresses,
  addressHint,
  ipv4Addresses,
}
