"use strict"

const { Plugin, Store } = require("@opencode/plugin/gui")
const { Schema } = require("effect")
const { setup } = require("./renderer.js")
const main = require("./main.js")
const en = require("./strings.js")

module.exports = {
  default: Plugin.define({
    stores: {
      web: Store.global(Schema.Struct({ url: Schema.String, token: Schema.String }), {
        url: "http://127.0.0.1:47821",
        token: "",
      }),
    },
    i18n: { en },
    setup,
    main,
  }),
}
