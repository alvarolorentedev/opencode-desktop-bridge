"use strict"

const { Plugin } = require("@opencode/plugin/gui")
const { setup } = require("./renderer.js")
const main = require("./main.js")
const en = require("./strings.js")

module.exports = {
  default: Plugin.define({
    i18n: { en },
    setup,
    main,
  }),
}
