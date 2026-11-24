"use strict"

const { createBridge } = require("./bridge.js")
const { createCatalog, normalizeUrl, manualId } = require("./catalog.js")
const { createControlPlane } = require("./control.js")
const { createDeviceStore } = require("./devices.js")
const { createServerRegistry } = require("./registry.js")
const { issuePairing, redeemPairing } = require("./native.js")
const { normalizeConfig, reachableAddresses, addressHint, ipv4Addresses } = require("./config.js")

module.exports = {
  createBridge,
  createCatalog,
  createControlPlane,
  createDeviceStore,
  createServerRegistry,
  issuePairing,
  redeemPairing,
  normalizeConfig,
  normalizeUrl,
  manualId,
  reachableAddresses,
  addressHint,
  ipv4Addresses,
}
