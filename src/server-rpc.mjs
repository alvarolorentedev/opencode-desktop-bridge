import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const object = (properties, required) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})
const text = { type: "string" }
const number = { type: "number" }

export const BridgeRemote = {
  id: "desktop-bridge.remote",
  methods: {
    attach: {
      input: object({ host: text, port: number, route: text }, ["host", "port", "route"]),
      output: object({ url: text, route: text }, ["url", "route"]),
    },
    detach: {
      input: object({}, []),
      output: object({ ok: { type: "boolean" } }, ["ok"]),
    },
    status: {
      input: object({}, []),
      output: object({ state: text, url: text, error: text }, ["state", "url", "error"]),
    },
    qr: {
      input: object({ text }, ["text"]),
      output: object({ svg: text }, ["svg"]),
    },
  },
  events: {},
}

let qrcode

export function makeQr(value) {
  if (typeof value !== "string" || !value || value.length > 4096) throw new Error("Invalid pairing payload.")
  if (!qrcode) qrcode = require("qrcode-generator")
  const code = qrcode(0, "M")
  code.addData(value)
  code.make()
  return code.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
}

export function createHandlers(remote, render = makeQr) {
  return {
    attach: (input) => remote.attach(input),
    detach: async () => {
      await remote.detach()
      return { ok: true }
    },
    status: async () => remote.status(),
    qr: async ({ text: value }) => ({ svg: render(value) }),
  }
}
