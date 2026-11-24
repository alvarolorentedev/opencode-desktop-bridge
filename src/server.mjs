import { Plugin } from "@opencode/plugin"
import { createRemote } from "./core/remote.mjs"
import { BridgeRemote, createHandlers } from "./server-rpc.mjs"

export default Plugin.define({
  id: "@alvarolorentedev/opencode-desktop-bridge",
  async setup(context) {
    const remote = createRemote({
      createClient: async () => {
        const { create } = await import("@opentunnel/client/promise")
        return create()
      },
      log: (level, message, data) => {
        try {
          if (context.log && typeof context.log.write === "function") context.log.write(level, message, data)
        } catch {
          // Logging must never break the tunnel.
        }
      },
    })

    const registration = await context.rpc.register(BridgeRemote, createHandlers(remote))

    return async () => {
      await remote.detach()
      if (registration && typeof registration.dispose === "function") await registration.dispose()
    }
  },
})
