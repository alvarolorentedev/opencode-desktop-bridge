/* opencode-desktop-bridge — Apache-2.0 */
/* One virtual OpenCode server for every server configured in OpenCode Desktop. */
const __modules = {
  "gui/contract.js": function (module, exports, require) {
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
    
  },
  "gui/dom.js": function (module, exports, require) {
    "use strict"
    
    function el(tag, attributes, children) {
      const node = document.createElement(tag)
      for (const [name, value] of Object.entries(attributes || {})) {
        if (value === undefined || value === null || value === false) continue
        if (name === "class") node.className = value
        else if (name === "text") node.textContent = value
        else if (name.startsWith("on") && typeof value === "function") node.addEventListener(name.slice(2).toLowerCase(), value)
        else if (name === "checked" || name === "value" || name === "disabled") node[name] = value
        else node.setAttribute(name, String(value))
      }
      const list = Array.isArray(children) ? children : children === undefined ? [] : [children]
      for (const child of list) {
        if (child === undefined || child === null || child === false) continue
        node.append(child instanceof Node ? child : document.createTextNode(String(child)))
      }
      return node
    }
    
    function clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild)
    }
    
    function relativeTime(value) {
      if (!value) return ""
      const delta = Date.now() - value
      if (delta < 60_000) return "just now"
      if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
      if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
      return `${Math.floor(delta / 86_400_000)}d ago`
    }
    
    module.exports = { el, clear, relativeTime }
    
  },
  "gui/strings.js": function (module, exports, require) {
    "use strict"
    
    module.exports = {
      title: "Desktop Bridge",
      description: "One OpenCode server on your phone for every server configured in Desktop, the TUI or the web.",
      status: "Status",
      running: "Running",
      stopped: "Stopped",
      starting: "Starting",
      failed: "Failed",
      enabled: "On",
      shareServers: "Share servers",
      shareServersHint: "Use every server in Desktop from OpenCode Mobile through the same encrypted tunnel as Pairing.",
      remote: "Internet access",
      remoteOn: "Internet access on",
      remoteOff: "Internet access off",
      remoteStarting: "Setting up internet access…",
      remoteFailed: "Internet access failed:",
      retry: "Retry",
      disableRemote: "Turn off internet access",
      disableRemoteHint: "Closes the tunnel route. Pairing on this network keeps working.",
      pairRemote: "Pair over the internet",
      pairLocal: "Pair on this network",
      pairRemoteHint: "Scan with OpenCode Mobile. Works anywhere through the existing encrypted tunnel.",
      pairLocalHint: "Scan with OpenCode Mobile on the same network.",
      pairingEmpty: "Choose how this phone reaches the bridge.",
      localOnly: "This address only works on this computer. Use Pair over the internet, or set a bind address in Advanced.",
      newCode: "New code",
      copyLink: "Copy link",
      copyCommand: "Copy command",
      advanced: "Advanced",
      hideAdvanced: "Hide advanced",
      advancedHint: "Network, configuration server, TUI & web, diagnostics.",
      configServer: "Configuration server",
      configServerHint: "Supplies models, agents and global configuration.",
      network: "Network",
      host: "Bind address",
      hostHint: "127.0.0.1 is this computer only. 0.0.0.0 exposes the bridge on your local network.",
      port: "Port",
      portHint: "Changing the port breaks profiles already paired to the old address.",
      publicUrl: "Public URL",
      publicUrlHint: "Optional HTTPS address or tunnel used in pairing links and API responses.",
      save: "Save",
      servers: "Servers",
      serversHint: "Exposed servers appear together as one OpenCode server on the phone.",
      expose: "Expose",
      configServer: "Configuration",
      useForConfig: "Use for config",
      pairing: "Pair a device",
      pairingHint: "Run this command, or create a link below. A code expires in 5 minutes and works once.",
      pair: "Create pairing link",
      copy: "Copy",
      copied: "Copied",
      devices: "Devices",
      noDevices: "No devices paired.",
      revoke: "Revoke",
      diagnostics: "Diagnostics",
      bridgeUrl: "Bridge URL",
      addresses: "Addresses",
      version: "Version",
      desktopServer: "Desktop server",
      ready: "ready",
      notReady: "not ready",
      loopbackWarning: "The bridge listens on this computer only. Set a network address or a public URL before pairing a phone.",
      commandGroup: "Desktop Bridge",
      open: "Open Desktop Bridge settings",
      invalidPort: "Use a port between 1 and 65535.",
      mainStarting: "Waiting for the Desktop plugin to start.",
      noSidecar: "The Desktop server is not ready yet.",
      tuiWeb: "TUI & Web",
      tuiWebHint: "Configure the same bridge from the terminal or the web app. Use the admin token below.",
      adminToken: "Admin token",
      adminTokenHint: "Used by the TUI and web settings pages to add servers to this bridge.",
      adminTokenMissing: "Enter the bridge admin token.",
      tuiToken: "TUI device token",
      tuiTokenHint: "Connect the TUI to this bridge as one server.",
      createTuiToken: "Create TUI token",
      webHint: "Web: open Settings › Desktop Bridge, enter the bridge URL and admin token, then sync this browser's servers.",
      webTitle: "Web sync",
      webPageDescription: "Sync this browser's OpenCode servers into the Desktop Bridge.",
      webUrlHint: "The bridge address the web app writes to.",
      webTokenHint: "From Desktop Settings › Desktop Bridge › Admin token.",
      webServers: "This browser's servers",
      webServersHint: "These servers are added to the bridge under the web source.",
      noServers: "No servers to sync.",
      syncServers: "Sync this browser's servers",
      syncDone: "Synced {count} servers.",
      refreshStatus: "Refresh status",
    }
    
  },
  "gui/stylesheet.js": function (module, exports, require) {
    "use strict"
    
    module.exports = `
    .odb { display: flex; flex-direction: column; gap: 14px; }
    .odb-muted { opacity: .68; font-size: 12px; line-height: 1.4; }
    .odb-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 9px 0; }
    .odb-row-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .odb-row-title { font-weight: 500; }
    .odb-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .odb-input { font: inherit; color: inherit; background: transparent; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius: 6px; padding: 4px 8px; min-width: 90px; }
    .odb-input:focus { outline: 2px solid color-mix(in srgb, currentColor 35%, transparent); outline-offset: 1px; }
    .odb-button { font: inherit; color: inherit; background: color-mix(in srgb, currentColor 8%, transparent); border: 1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
    .odb-button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
    .odb-button:disabled { opacity: .5; cursor: default; }
    .odb-primary { font-weight: 600; }
    .odb-qr { align-self: center; width: 200px; height: 200px; padding: 8px; border-radius: 8px; background: #fff; }
    .odb-qr svg { display: block; width: 100%; height: 100%; }
    .odb-list { display: flex; flex-direction: column; gap: 7px; }
    .odb-item { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .odb-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .odb-code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; word-break: break-all; }
    .odb-card { border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .odb-link { font: inherit; color: inherit; background: none; border: none; text-decoration: underline; cursor: pointer; padding: 0; }
    .odb-warning { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); border-radius: 8px; padding: 8px 10px; font-size: 12px; }
    .odb-error { color: color-mix(in srgb, #d33 70%, currentColor); font-size: 12px; }
    .odb-tag { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .6; }
    `
    
  },
  "gui/renderer.js": function (module, exports, require) {
    "use strict"
    
    const { createComponent, createEffect, onCleanup } = require("solid-js")
    const { SettingsPage, Command, Style } = require("@opencode/plugin/gui")
    const { BridgeIpc } = require("@b/gui/contract.js")
    const { el, clear, relativeTime } = require("@b/gui/dom.js")
    const strings = require("@b/gui/strings.js")
    const css = require("@b/gui/stylesheet.js")
    
    function isLoopback(host) {
      return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
    }
    
    function setup(ctx) {
      if (!ctx.desktop) return setupWeb(ctx)
      ctx.add(Style, css)
    
      const ipc = ctx.main(BridgeIpc)
      const t = (key) => {
        try {
          const value = ctx.t(key)
          return value === key ? strings[key] || key : value
        } catch {
          return strings[key] || key
        }
      }
    
      function pushServers() {
        const list = ctx.servers.list().map((id) => {
          const server = ctx.servers.get(id)
          return {
            id,
            name: server && server.name ? server.name : id,
            connected: Boolean(server && server.connected),
            builtin: Boolean(server && server.builtin),
            local: Boolean(server && server.local),
          }
        })
        if (pushing) return
        pushing = true
        ipc.reportServers(list).then(
          () => {
            pushing = false
          },
          () => {
            pushing = false
          },
        )
      }
      let pushing = false
    
      createEffect(() => {
        ctx.servers.list().forEach((id) => ctx.servers.get(id))
        pushServers()
      })
      const pushTimer = setInterval(pushServers, 2000)
      try {
        onCleanup(() => clearInterval(pushTimer))
      } catch {
        // The host owns the root; a setup without one is already torn down.
      }
    
      let page
      ctx.add(SettingsPage, {
        id: "desktop-bridge",
        get title() {
          return t("title")
        },
        render: () => {
          if (!page) page = renderPage(ctx, ipc, t)
          else if (typeof page.__refresh === "function") void page.__refresh()
          return page
        },
      })
    
      ctx.add(Command, {
        id: "open",
        get title() {
          return t("open")
        },
        get group() {
          return t("commandGroup")
        },
        run: () => ctx.layout.settings("desktop-bridge"),
      })
    }
    
    function renderPage(ctx, ipc, t) {
      const row = (title, description, control) => {
        if (ctx.ui && typeof ctx.ui.SettingsRow === "function") {
          try {
            return createComponent(ctx.ui.SettingsRow, { title: title || "", description: description || undefined, children: control })
          } catch {
            // Older SDKs fall through to the plain row.
          }
        }
        return el("div", { class: "odb-row" }, [
          el("div", { class: "odb-row-copy" }, [
            el("div", { class: "odb-row-title" }, title),
            description ? el("div", { class: "odb-muted" }, description) : null,
          ]),
          control,
        ])
      }
    
      const section = (title, rows) => {
        if (ctx.ui && typeof ctx.ui.SettingsSection === "function") {
          try {
            return createComponent(ctx.ui.SettingsSection, { title, children: rows })
          } catch {
            // Older SDKs fall through to the plain section.
          }
        }
        return el("div", { class: "odb" }, [title ? el("div", { class: "odb-tag" }, title) : null, ...rows])
      }
    
      const statusText = el("div", { class: "odb-muted" }, t("mainStarting"))
      const remoteText = el("div", { class: "odb-muted odb-code" }, t("remoteOff"))
      const enable = el("input", { type: "checkbox" })
      const pairRemote = el("button", { class: "odb-button odb-primary" }, t("pairRemote"))
      const pairLocal = el("button", { class: "odb-button" }, t("pairLocal"))
      const retry = el("button", { class: "odb-button" }, t("retry"))
      retry.style.display = "none"
      const errorBox = el("div", { class: "odb-error" })
      const serversBox = el("div", { class: "odb-list" })
      const devicesBox = el("div", { class: "odb-list" })
      const pairBox = el("div", { class: "odb-card" })
      const configServerBox = el("div", { class: "odb-list" })
      const tuiWebBox = el("div", { class: "odb-list" })
      const diagBox = el("div", { class: "odb-list" })
      const host = el("input", { class: "odb-input", value: "127.0.0.1", spellcheck: "false" })
      const port = el("input", { class: "odb-input", value: "47821", inputmode: "numeric" })
      const publicUrl = el("input", { class: "odb-input", placeholder: "https://…", spellcheck: "false" })
      const save = el("button", { class: "odb-button" }, t("save"))
      const disableRemote = el("button", { class: "odb-button" }, t("disableRemote"))
      const advancedToggle = el("button", { class: "odb-button" }, t("advanced"))
      const advancedBody = el("div", { class: "odb" })
      advancedBody.style.display = "none"
    
      let snapshot
      let pairing
      let tuiToken
      let showAdvanced = false
    
      function showError(error) {
        errorBox.textContent = error instanceof Error ? error.message : String(error || "")
      }
    
      function copy(value, button) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) return
        void navigator.clipboard.writeText(value).then(() => {
          const previous = button.textContent
          button.textContent = t("copied")
          setTimeout(() => (button.textContent = previous), 1200)
        })
      }
    
      function isLoopbackBase(value) {
        try {
          const hostname = new URL(value).hostname
          return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]"
        } catch {
          return true
        }
      }
    
      function renderServers(snap) {
        clear(serversBox)
        if (!snap.servers.length) {
          serversBox.append(el("div", { class: "odb-muted" }, t("notReady")))
          return
        }
        for (const server of snap.servers) {
          const checkbox = el("input", { type: "checkbox", checked: server.exposed })
          checkbox.onchange = async () => {
            const hidden = new Set(snap.config.hiddenServers || [])
            if (checkbox.checked) hidden.delete(server.id)
            else hidden.add(server.id)
            try {
              snapshot = await ipc.setHidden([...hidden])
              apply(snapshot)
            } catch (error) {
              showError(error)
            }
          }
          const label = el("label", { class: "odb-item" }, [
            checkbox,
            el("span", { class: "odb-item-name" }, server.name),
            el("span", { class: "odb-muted" }, server.source && server.source !== "desktop" ? server.source : server.id === "sidecar" ? "desktop" : server.connected ? "" : "offline"),
          ])
          serversBox.append(label)
        }
      }
    
      function renderDevices(snap) {
        clear(devicesBox)
        if (!snap.devices.length) {
          devicesBox.append(el("div", { class: "odb-muted" }, t("noDevices")))
          return
        }
        for (const device of snap.devices) {
          const revoke = el("button", { class: "odb-button" }, t("revoke"))
          revoke.onclick = async () => {
            try {
              snapshot = await ipc.revokeDevice(device.id)
              apply(snapshot)
            } catch (error) {
              showError(error)
            }
          }
          devicesBox.append(
            el("div", { class: "odb-row" }, [
              el("div", { class: "odb-row-copy" }, [
                el("div", { class: "odb-row-title" }, device.name),
                el("div", { class: "odb-muted" }, `Paired ${relativeTime(device.createdAt)} · last seen ${relativeTime(device.lastSeenAt)} · expires ${new Date(device.expiresAt).toLocaleDateString()}`),
              ]),
              revoke,
            ]),
          )
        }
      }
    
      function renderConfigServer(snap) {
        clear(configServerBox)
        const options = snap.servers.filter((server) => server.exposed || server.configServer)
        if (!options.length) {
          configServerBox.append(el("div", { class: "odb-muted" }, t("notReady")))
          return
        }
        const select = el("select", { class: "odb-input" })
        for (const server of options) {
          const option = el("option", { value: server.id }, server.name)
          if (server.configServer) option.selected = true
          select.append(option)
        }
        select.onchange = async () => {
          try {
            snapshot = await ipc.setConfigServer(select.value)
            apply(snapshot)
          } catch (error) {
            showError(error)
          }
        }
        configServerBox.append(select)
      }
    
      function renderPairing(snap) {
        clear(pairBox)
        if (!pairing || pairing.expiresAt < Date.now()) {
          pairBox.append(el("div", { class: "odb-muted" }, t("pairingEmpty")))
          return
        }
        if (pairing.qr) {
          const qr = el("div", { class: "odb-qr" })
          qr.innerHTML = pairing.qr
          pairBox.append(qr)
        }
        pairBox.append(el("div", { class: "odb-code" }, pairing.link))
        pairBox.append(el("div", { class: "odb-code" }, pairing.command))
        const actions = el("div", { class: "odb-actions" }, [])
        const copyLink = el("button", { class: "odb-button" }, t("copyLink"))
        copyLink.onclick = () => copy(pairing.link, copyLink)
        const copyCommand = el("button", { class: "odb-button" }, t("copyCommand"))
        copyCommand.onclick = () => copy(pairing.command, copyCommand)
        const again = el("button", { class: "odb-button" }, t("newCode"))
        again.onclick = () => startPairing(pairing.remote ? "remote" : "local")
        actions.append(copyLink, copyCommand, again)
        pairBox.append(actions)
        pairBox.append(el("div", { class: "odb-muted" }, `Expires ${new Date(pairing.expiresAt).toLocaleTimeString()}`))
        pairBox.append(el("div", { class: "odb-muted" }, pairing.remote ? t("pairRemoteHint") : t("pairLocalHint")))
        if (!pairing.remote && isLoopbackBase(pairing.base)) {
          pairBox.append(el("div", { class: "odb-warning" }, t("localOnly")))
        }
      }
    
      function renderTuiWeb(snap) {
        clear(tuiWebBox)
        const base = `http://127.0.0.1:${snap.status.port}`
        const admin = el("input", { class: "odb-input", value: snap.adminToken || "", readonly: "readonly", spellcheck: "false" })
        const copyAdmin = el("button", { class: "odb-button" }, t("copy"))
        copyAdmin.onclick = () => copy(snap.adminToken || "", copyAdmin)
        tuiWebBox.append(
          el("div", { class: "odb-row" }, [
            el("div", { class: "odb-row-copy" }, [
              el("div", { class: "odb-row-title" }, t("adminToken")),
              el("div", { class: "odb-muted" }, t("adminTokenHint")),
            ]),
            el("div", { class: "odb-actions" }, [admin, copyAdmin]),
          ]),
        )
        if (tuiToken) {
          const token = el("div", { class: "odb-code" }, tuiToken)
          const command = el("div", { class: "odb-code" }, `OPENCODE_PASSWORD=${tuiToken} opencode --server ${base}`)
          const copyToken = el("button", { class: "odb-button" }, t("copy"))
          copyToken.onclick = () => copy(tuiToken, copyToken)
          const copyCommand = el("button", { class: "odb-button" }, t("copy"))
          copyCommand.onclick = () => copy(`OPENCODE_PASSWORD=${tuiToken} opencode --server ${base}`, copyCommand)
          tuiWebBox.append(
            el("div", { class: "odb-row" }, [
              el("div", { class: "odb-row-copy" }, [
                el("div", { class: "odb-row-title" }, t("tuiToken")),
                el("div", { class: "odb-muted" }, t("tuiTokenHint")),
              ]),
            ]),
            token,
            el("div", { class: "odb-actions" }, [copyToken]),
            command,
            el("div", { class: "odb-actions" }, [copyCommand]),
          )
        } else {
          const create = el("button", { class: "odb-button" }, t("createTuiToken"))
          create.onclick = async () => {
            try {
              const result = await ipc.createDevice("TUI")
              tuiToken = result.token
              renderTuiWeb(snapshot)
            } catch (error) {
              showError(error)
            }
          }
          tuiWebBox.append(
            el("div", { class: "odb-row" }, [
              el("div", { class: "odb-row-copy" }, [
                el("div", { class: "odb-row-title" }, t("tuiToken")),
                el("div", { class: "odb-muted" }, t("tuiTokenHint")),
              ]),
              create,
            ]),
          )
        }
        tuiWebBox.append(el("div", { class: "odb-muted" }, t("webHint")))
      }
    
      function renderDiagnostics(snap) {
        clear(diagBox)
        const line = (title, value) =>
          diagBox.append(
            el("div", { class: "odb-row" }, [
              el("div", { class: "odb-row-copy" }, [el("div", { class: "odb-row-title" }, title), el("div", { class: "odb-muted" }, value)]),
            ]),
          )
        line(t("bridgeUrl"), snap.status.baseUrl || "—")
        line(t("remote"), snap.remote && snap.remote.url ? snap.remote.url : t("remoteOff"))
        line(t("addresses"), snap.status.addresses.join("  ·  ") || "—")
        line(t("version"), `bridge ${snap.bridgeVersion} · desktop ${snap.appVersion}`)
        line(t("desktopServer"), snap.sidecarReady ? t("ready") : t("notReady"))
      }
    
      function apply(snap) {
        snapshot = snap
        const state = snap.status.state
        statusText.textContent =
          state === "running"
            ? t("running")
            : state === "starting"
              ? t("starting")
              : state === "error"
                ? `${t("failed")} · ${snap.status.error}`
                : t("stopped")
        const remote = snap.remote || { state: "off", url: "", error: "" }
        remoteText.textContent =
          remote.state === "on"
            ? `${t("remoteOn")} · ${remote.url}`
            : remote.state === "starting"
              ? t("remoteStarting")
              : remote.state === "error"
                ? `${t("remoteFailed")} ${remote.error}`
                : t("remoteOff")
        retry.style.display = remote.state === "error" ? "" : "none"
        disableRemote.style.display = snap.config.remoteEnabled ? "" : "none"
        enable.checked = Boolean(snap.config.enabled)
        if (document.activeElement !== host) host.value = snap.config.host
        if (document.activeElement !== port) port.value = String(snap.config.port)
        if (document.activeElement !== publicUrl) publicUrl.value = snap.config.publicUrl || ""
        renderServers(snap)
        renderConfigServer(snap)
        renderDevices(snap)
        if (pairing && pairing.expiresAt < Date.now()) pairing = undefined
        renderPairing(snap)
        renderDiagnostics(snap)
        renderTuiWeb(snap)
        if (!snap.config.enabled) pairing = undefined
      }
    
      async function refresh() {
        if (refreshing) return
        refreshing = true
        try {
          apply(await ipc.snapshot())
        } catch (error) {
          statusText.textContent = t("mainStarting")
          showError(error)
        } finally {
          refreshing = false
        }
      }
      let refreshing = false
    
      async function startPairing(mode) {
        errorBox.textContent = ""
        pairRemote.disabled = true
        pairLocal.disabled = true
        try {
          if (!snapshot || !snapshot.config.enabled) {
            snapshot = await ipc.setEnabled(true)
            apply(snapshot)
          }
          pairing = await ipc.pair({ mode })
          renderPairing(snapshot)
          apply(await ipc.snapshot())
        } catch (error) {
          showError(error)
        } finally {
          pairRemote.disabled = false
          pairLocal.disabled = false
        }
      }
    
      enable.onchange = async () => {
        try {
          pairing = undefined
          apply(await ipc.setEnabled(enable.checked))
        } catch (error) {
          showError(error)
        }
      }
    
      pairRemote.onclick = () => startPairing("remote")
      pairLocal.onclick = () => startPairing("local")
    
      retry.onclick = async () => {
        try {
          apply(await ipc.setRemote(true))
        } catch (error) {
          showError(error)
        }
      }
    
      disableRemote.onclick = async () => {
        try {
          apply(await ipc.setRemote(false))
        } catch (error) {
          showError(error)
        }
      }
    
      save.onclick = async () => {
        const value = Number(port.value)
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          errorBox.textContent = t("invalidPort")
          return
        }
        errorBox.textContent = ""
        try {
          pairing = undefined
          apply(await ipc.setNetwork({ host: host.value.trim() || "127.0.0.1", port: value, publicUrl: publicUrl.value.trim() }))
        } catch (error) {
          showError(error)
        }
      }
    
      advancedToggle.onclick = () => {
        showAdvanced = !showAdvanced
        advancedBody.style.display = showAdvanced ? "" : "none"
        advancedToggle.textContent = showAdvanced ? t("hideAdvanced") : t("advanced")
      }
    
      advancedBody.append(
        row(t("host"), t("hostHint"), host),
        row(t("port"), t("portHint"), port),
        row(t("publicUrl"), t("publicUrlHint"), publicUrl),
        row(null, null, el("div", { class: "odb-actions" }, [save])),
        row(t("configServer"), t("configServerHint"), configServerBox),
        row(t("remote"), t("disableRemoteHint"), disableRemote),
        row(t("tuiWeb"), t("tuiWebHint"), null),
        tuiWebBox,
        row(t("diagnostics"), null, null),
        diagBox,
      )
    
      const root = el("div", { class: "odb" }, [
        section(t("shareServers"), [
          row(null, t("shareServersHint"), el("label", { class: "odb-item" }, [enable, el("span", {}, t("enabled"))])),
          row(t("status"), statusText, null),
          row(t("remote"), remoteText, el("div", { class: "odb-actions" }, [retry])),
          row(null, null, el("div", { class: "odb-actions" }, [pairRemote, pairLocal])),
          pairBox,
        ]),
        section(t("servers"), [row(t("servers"), t("serversHint"), serversBox)]),
        section(t("devices"), [row(t("devices"), null, devicesBox)]),
        section(t("advanced"), [row(t("advanced"), t("advancedHint"), advancedToggle), advancedBody]),
        errorBox,
      ])
    
      let page
      if (ctx.ui && typeof ctx.ui.SettingsLayout === "function") {
        try {
          page = createComponent(ctx.ui.SettingsLayout, { title: t("title"), description: t("description"), children: root })
        } catch {
          page = root
        }
      } else {
        page = root
      }
    
      void refresh()
      page.__refresh = refresh
      const timer = setInterval(() => void refresh(), 3000)
      try {
        onCleanup(() => clearInterval(timer))
      } catch {
        // No owner means the page is already detached.
      }
      return page
    }
    
    function translate(ctx, key) {
      try {
        const value = ctx.t(key)
        return value === key ? strings[key] || key : value
      } catch {
        return strings[key] || key
      }
    }
    
    function copyValue(value, button, copied) {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return
      void navigator.clipboard.writeText(value).then(() => {
        const previous = button.textContent
        button.textContent = copied
        setTimeout(() => (button.textContent = previous), 1200)
      })
    }
    
    function webRow(ctx, title, description, control) {
      if (ctx.ui && typeof ctx.ui.SettingsRow === "function") {
        try {
          return createComponent(ctx.ui.SettingsRow, { title: title || "", description: description || undefined, children: control })
        } catch {
          // Fall through to the plain row.
        }
      }
      return el("div", { class: "odb-row" }, [
        el("div", { class: "odb-row-copy" }, [
          title ? el("div", { class: "odb-row-title" }, title) : null,
          description ? el("div", { class: "odb-muted" }, description) : null,
        ]),
        control,
      ])
    }
    
    function webSection(ctx, title, rows) {
      if (ctx.ui && typeof ctx.ui.SettingsSection === "function") {
        try {
          return createComponent(ctx.ui.SettingsSection, { title, children: rows })
        } catch {
          // Fall through to the plain section.
        }
      }
      return el("div", { class: "odb" }, [title ? el("div", { class: "odb-tag" }, title) : null, ...rows])
    }
    
    function setupWeb(ctx) {
      ctx.add(Style, css)
      const t = (key) => translate(ctx, key)
      const page = renderWebPage(ctx)
      ctx.add(SettingsPage, {
        id: "desktop-bridge-web",
        get title() {
          return t("title")
        },
        render: () => page,
      })
      ctx.add(Command, {
        id: "open-web",
        get title() {
          return t("open")
        },
        get group() {
          return t("commandGroup")
        },
        run: () => {
          if (ctx.layout && typeof ctx.layout.settings === "function") ctx.layout.settings("desktop-bridge-web")
        },
      })
    }
    
    function renderWebPage(ctx) {
      const t = (key) => translate(ctx, key)
      const store = ctx.stores && ctx.stores.web
      const initial = store && store.value ? store.value : { url: "http://127.0.0.1:47821", token: "" }
    
      const url = el("input", { class: "odb-input", value: initial.url, spellcheck: "false" })
      const token = el("input", { class: "odb-input", value: initial.token, spellcheck: "false" })
      const listBox = el("div", { class: "odb-list" })
      const output = el("div", { class: "odb-card" })
      const errorBox = el("div", { class: "odb-error" })
    
      function base() {
        return (url.value.trim() || "http://127.0.0.1:47821").replace(/\/+$/, "")
      }
    
      function adminToken() {
        return token.value.trim()
      }
    
      function remember() {
        if (!store || typeof store.update !== "function") return
        const nextUrl = url.value.trim()
        const nextToken = token.value.trim()
        store.update((draft) => {
          draft.url = nextUrl
          draft.token = nextToken
        })
      }
    
      url.onchange = remember
      token.onchange = remember
    
      function showError(error) {
        errorBox.textContent = error instanceof Error ? error.message : String(error || "")
      }
    
      function normalize(value) {
        try {
          const parsed = new URL(value)
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
          if (parsed.username || parsed.password) return undefined
          return parsed.href.replace(/\/+$/, "")
        } catch {
          return undefined
        }
      }
    
      function collect() {
        const bridge = normalize(base())
        const result = []
        if (!ctx.servers || typeof ctx.servers.list !== "function" || typeof ctx.servers.get !== "function") return result
        for (const id of ctx.servers.list()) {
          const server = ctx.servers.get(id)
          if (!server || !server.url) continue
          const address = normalize(server.url)
          if (!address || address === bridge) continue
          if (/^https?:\/\/127\.0\.0\.1:0$/.test(address)) continue
          result.push({ name: server.name || address, url: address, password: server.password || "" })
        }
        return result
      }
    
      function renderList() {
        clear(listBox)
        const servers = collect()
        if (!servers.length) {
          listBox.append(el("div", { class: "odb-muted" }, t("noServers")))
          return
        }
        for (const server of servers) {
          listBox.append(
            el("div", { class: "odb-row" }, [
              el("div", { class: "odb-row-copy" }, [
                el("div", { class: "odb-row-title" }, server.name),
                el("div", { class: "odb-muted" }, server.url),
              ]),
            ]),
          )
        }
      }
    
      async function api(path, options = {}) {
        const value = adminToken()
        if (!value) throw new Error(t("adminTokenMissing"))
        const headers = { ...(options.headers || {}), authorization: `Bearer ${value}` }
        if (options.body !== undefined) headers["content-type"] = "application/json"
        const response = await fetch(`${base()}/bridge/v1/admin${path}`, { ...options, headers })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body && body.message ? body.message : `Request failed (${response.status})`)
        return body
      }
    
      function showLink(link) {
        clear(output)
        const code = el("div", { class: "odb-code" }, link)
        const copy = el("button", { class: "odb-button" }, t("copy"))
        copy.onclick = () => copyValue(link, copy, t("copied"))
        output.append(code, el("div", { class: "odb-actions" }, [copy]))
      }
    
      const sync = el("button", { class: "odb-button" }, t("syncServers"))
      sync.onclick = async () => {
        errorBox.textContent = ""
        try {
          remember()
          const servers = collect()
          const result = await api("/servers/web", { method: "PUT", body: JSON.stringify({ servers }) })
          clear(output)
          output.append(
            el("div", { class: "odb-muted" }, t("syncDone").replace("{count}", String(result.data.length))),
          )
          renderList()
        } catch (error) {
          showError(error)
        }
      }
    
      const pair = el("button", { class: "odb-button" }, t("pair"))
      pair.onclick = async () => {
        errorBox.textContent = ""
        try {
          remember()
          const result = await api("/pair", { method: "POST" })
          showLink(result.link)
        } catch (error) {
          showError(error)
        }
      }
    
      const status = el("button", { class: "odb-button" }, t("refreshStatus"))
      status.onclick = async () => {
        errorBox.textContent = ""
        try {
          remember()
          const result = await api("/status")
          clear(output)
          output.append(
            el("div", { class: "odb-muted" }, `${result.baseUrl || base()} · ${result.sources.map((source) => `${source.name}: ${source.count}`).join(" · ")}`),
          )
          renderList()
        } catch (error) {
          showError(error)
        }
      }
    
      const root = el("div", { class: "odb" }, [
        webSection(ctx, t("webTitle"), [
          webRow(ctx, t("bridgeUrl"), t("webUrlHint"), url),
          webRow(ctx, t("adminToken"), t("webTokenHint"), token),
          webRow(ctx, t("webServers"), t("webServersHint"), listBox),
          webRow(ctx, null, null, el("div", { class: "odb-actions" }, [sync, pair, status])),
        ]),
        output,
        errorBox,
      ])
    
      renderList()
      if (ctx.ui && typeof ctx.ui.SettingsLayout === "function") {
        try {
          return createComponent(ctx.ui.SettingsLayout, {
            title: t("title"),
            description: t("webPageDescription"),
            children: root,
          })
        } catch {
          return root
        }
      }
      return root
    }
    
    module.exports = { setup, setupWeb, renderPage, renderWebPage }
    
  },
  "core/routing.js": function (module, exports, require) {
    "use strict"
    
    const SESSION_RESERVED = new Set(["active", "stats", "import"])
    const SESSION_ROUTE = /^\/api\/session\/([^/]+)(\/.*)?$/
    const PROJECT_ROUTE = /^\/api\/project\/([^/]+)(\/.*)?$/
    const PTY_ROUTE = /^\/api\/pty\/([^/]+)(\/.*)?$/
    const PERSISTENT_PTY_ROUTE = /^\/api\/experimental\/persistent-pty\/([^/]+)(\/.*)?$/
    const EXPERIMENTAL_SESSION_ROUTE = /^\/api\/experimental\/session\/([^/]+)(\/.*)?$/
    const PAIR_ROUTE = /^\/auth\/connect\/([^/]+)$/
    const SAVED_PERMISSION_ROUTE = /^\/api\/permission\/saved\/([^/]+)$/
    
    function stripBasePath(pathname, basePath) {
      if (!basePath) return pathname
      if (pathname === basePath) return "/"
      if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length)
      return undefined
    }
    
    function queryValue(searchParams, name) {
      return searchParams.get(name) || undefined
    }
    
    function directoryFromQuery(searchParams) {
      return queryValue(searchParams, "location[directory]") || queryValue(searchParams, "directory")
    }
    
    function decode(value) {
      try {
        return decodeURIComponent(value)
      } catch {
        return value
      }
    }
    
    function directoryFromBody(body) {
      if (!body || typeof body !== "object") return undefined
      const location = body.location && typeof body.location === "object" ? body.location : undefined
      const value = (location && location.directory) || body.directory
      if (typeof value !== "string" || !value.trim()) return undefined
      return value
    }
    
    function classify(method, pathname, searchParams) {
      if (pathname === "/api/info") return { kind: "info" }
      if (pathname === "/api/health") return { kind: "health" }
      if (pathname === "/api/event") return { kind: "event" }
      if (pathname === "/bridge/v1/capabilities") return { kind: "capabilities" }
      if (pathname === "/bridge/v1/servers") return { kind: "servers" }
    
      const pair = PAIR_ROUTE.exec(pathname)
      if (pair && method === "GET") return { kind: "pair", code: decode(pair[1]) }
      if (pathname === "/api/pair" && method === "POST") return { kind: "pair-issue" }
    
      if (pathname === "/api/session") {
        if (method === "POST") return { kind: "session-create", directory: directoryFromQuery(searchParams) }
        const directory = directoryFromQuery(searchParams)
        if (directory) return { kind: "sessions", directory }
        return { kind: "sessions" }
      }
    
      const session = SESSION_ROUTE.exec(pathname)
      if (session) {
        const id = decode(session[1])
        if (SESSION_RESERVED.has(id)) {
          if (id === "active" && method === "GET") return { kind: "active" }
          return { kind: "config" }
        }
        return { kind: "session", id }
      }
    
      if (pathname === "/api/pty") {
        const directory = directoryFromQuery(searchParams)
        if (method === "POST") return { kind: "pty-create", directory }
        return directory ? { kind: "pty-list", directory } : { kind: "pty-list" }
      }
    
      const pty = PTY_ROUTE.exec(pathname)
      if (pty) return { kind: "pty", id: decode(pty[1]) }
    
      const persistentPty = PERSISTENT_PTY_ROUTE.exec(pathname)
      if (persistentPty) return { kind: "pty", id: decode(persistentPty[1]) }
    
      const experimentalSession = EXPERIMENTAL_SESSION_ROUTE.exec(pathname)
      if (experimentalSession) {
        const id = decode(experimentalSession[1])
        if (id !== "stats") return { kind: "session", id }
      }
    
      if (pathname === "/api/project" && method === "GET") return { kind: "projects" }
      const project = PROJECT_ROUTE.exec(pathname)
      if (project) return { kind: "project", id: decode(project[1]) }
      if (pathname === "/api/location" && method === "GET") {
        return { kind: "location", directory: directoryFromQuery(searchParams) }
      }
      if (pathname === "/api/permission/request" && method === "GET") return { kind: "permissions" }
      if (pathname === "/api/form" && method === "GET") return { kind: "forms" }
      if (pathname === "/api/permission/saved") {
        return method === "GET" ? { kind: "saved-permissions" } : { kind: "config" }
      }
      const saved = SAVED_PERMISSION_ROUTE.exec(pathname)
      if (saved) return { kind: "saved-permission", id: decode(saved[1]) }
    
      if (pathname === "/api/fs/list") {
        return { kind: "fs-list", directory: directoryFromQuery(searchParams), path: queryValue(searchParams, "path") }
      }
      if (pathname.startsWith("/api/fs/") || pathname.startsWith("/api/experimental/fs/")) {
        return { kind: "directory", directory: directoryFromQuery(searchParams) }
      }
      if (pathname.startsWith("/api/vcs")) {
        return { kind: "directory", directory: directoryFromQuery(searchParams) }
      }
      if (pathname.startsWith("/api/worktree")) {
        return {
          kind: "directory",
          directory: directoryFromQuery(searchParams),
          projectID: queryValue(searchParams, "projectID"),
        }
      }
    
      if (pathname.startsWith("/api/")) return { kind: "config" }
      return { kind: "not-found" }
    }
    
    function isUpgradePath(pathname) {
      return pathname.startsWith("/api/")
    }
    
    function encodeCursor(values) {
      return `brg1.${Buffer.from(JSON.stringify(values)).toString("base64url")}`
    }
    
    function decodeCursor(value) {
      if (typeof value !== "string" || !value.startsWith("brg1.")) return undefined
      try {
        const parsed = JSON.parse(Buffer.from(value.slice(5), "base64url").toString("utf8"))
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
        const result = {}
        for (const [key, cursor] of Object.entries(parsed)) {
          if (typeof cursor === "string" && cursor) result[key] = cursor
        }
        return result
      } catch {
        return undefined
      }
    }
    
    module.exports = {
      stripBasePath,
      classify,
      isUpgradePath,
      directoryFromQuery,
      directoryFromBody,
      encodeCursor,
      decodeCursor,
    }
    
  },
  "core/util.js": function (module, exports, require) {
    "use strict"
    
    const crypto = require("node:crypto")
    
    function randomId(prefix, bytes = 16) {
      return `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`
    }
    
    function sha256(value) {
      return crypto.createHash("sha256").update(value).digest("hex")
    }
    
    function joinPath(base, pathname) {
      const left = base === "/" ? "" : base.replace(/\/+$/, "")
      const right = pathname.startsWith("/") ? pathname : `/${pathname}`
      return `${left}${right}` || "/"
    }
    
    function parseUrl(input) {
      try {
        return new URL(input, "http://bridge.invalid")
      } catch {
        return undefined
      }
    }
    
    function truncate(value, length) {
      const text = String(value ?? "")
      return text.length > length ? text.slice(0, length) : text
    }
    
    function errorMessage(error) {
      return error instanceof Error ? error.message : String(error)
    }
    
    function basicAuth(password) {
      return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`
    }
    
    module.exports = { randomId, sha256, joinPath, parseUrl, truncate, errorMessage, basicAuth }
    
  },
  "core/http.js": function (module, exports, require) {
    "use strict"
    
    const http = require("node:http")
    const https = require("node:https")
    const net = require("node:net")
    const tls = require("node:tls")
    const { joinPath } = require("@b/core/util.js")
    
    const REQUEST_DROP = new Set([
      "host",
      "authorization",
      "cookie",
      "proxy-authorization",
      "proxy-connection",
      "connection",
      "keep-alive",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade",
      "origin",
      "referer",
      "forwarded",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-forwarded-proto",
      "x-real-ip",
    ])
    
    const RESPONSE_DROP = new Set([
      "connection",
      "keep-alive",
      "transfer-encoding",
      "trailer",
      "upgrade",
      "set-cookie",
      "www-authenticate",
      "location",
    ])
    
    function upstreamUrl(endpoint, pathname, search) {
      const url = new URL(endpoint.url)
      url.pathname = joinPath(url.pathname, pathname)
      url.search = search || ""
      return url
    }
    
    function requestHeaders(input, endpoint, url) {
      const headers = {}
      for (const [name, value] of Object.entries(input || {})) {
        if (value === undefined || value === null) continue
        const key = name.toLowerCase()
        if (REQUEST_DROP.has(key)) continue
        if (key === "auth_token") continue
        headers[key] = Array.isArray(value) ? value.join(", ") : String(value)
      }
      for (const [name, value] of Object.entries(endpoint.headers || {})) {
        if (typeof value === "string" && value) headers[name.toLowerCase()] = value
      }
      headers.host = url.host
      return headers
    }
    
    function responseHeaders(input) {
      const headers = {}
      for (const [name, value] of Object.entries(input || {})) {
        if (value === undefined || value === null) continue
        const key = name.toLowerCase()
        if (RESPONSE_DROP.has(key)) continue
        headers[key] = Array.isArray(value) ? value.join(", ") : String(value)
      }
      return headers
    }
    
    function library(url) {
      return url.protocol === "https:" ? https : http
    }
    
    function requestJson(endpoint, pathname, search, options = {}) {
      return new Promise((resolve, reject) => {
        const url = upstreamUrl(endpoint, pathname, search)
        const headers = {
          accept: "application/json",
          ...(options.headers || {}),
          ...(endpoint.headers || {}),
        }
        const body = options.body
        if (body !== undefined) {
          headers["content-type"] = headers["content-type"] || "application/json"
          headers["content-length"] = Buffer.byteLength(body)
        }
        const timeoutMs = options.timeoutMs === undefined ? 30000 : options.timeoutMs
        const controller = new AbortController()
        const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined
        const finish = (fn) => {
          if (timer) clearTimeout(timer)
          fn()
        }
        const req = library(url).request(
          url,
          { method: options.method || "GET", headers, signal: controller.signal },
          (res) => {
            const chunks = []
            let size = 0
            res.on("data", (chunk) => {
              size += chunk.length
              if (size > (options.limit || 4 * 1024 * 1024)) {
                req.destroy(new Error("Upstream response too large"))
                return
              }
              chunks.push(chunk)
            })
            res.on("end", () => {
              const raw = Buffer.concat(chunks)
              let parsed
              try {
                parsed = raw.length ? JSON.parse(raw.toString("utf8")) : undefined
              } catch {
                parsed = undefined
              }
              finish(() => resolve({ status: res.statusCode || 0, headers: res.headers, body: parsed, raw }))
            })
            res.on("error", (error) => finish(() => reject(error)))
          },
        )
        req.on("timeout", () => req.destroy(new Error("Upstream request timed out")))
        req.on("error", (error) => finish(() => reject(error)))
        if (body !== undefined) req.write(body)
        req.end()
      })
    }
    
    function proxy(req, res, endpoint, pathname, search, options = {}) {
      const url = upstreamUrl(endpoint, pathname, search)
      const headers = requestHeaders(req.headers, endpoint, url)
      const controller = new AbortController()
      const timeoutMs = options.timeoutMs || (req.method === "GET" || req.method === "HEAD" ? 15000 : 120000)
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const clear = () => clearTimeout(timer)
      const upstream = library(url).request(
        url,
        { method: req.method, headers, signal: controller.signal },
        (response) => {
          clear()
          if (res.headersSent || res.destroyed) {
            response.destroy()
            return
          }
          res.writeHead(response.statusCode || 502, responseHeaders(response.headers))
          res.flushHeaders()
          response.pipe(res)
          response.on("error", () => res.destroy())
          response.on("aborted", () => res.destroy())
        },
      )
      upstream.on("error", (error) => {
        clear()
        if (res.destroyed) return
        if (res.headersSent) {
          res.destroy()
          return
        }
        if (options.onError) {
          options.onError(error)
          return
        }
        const payload = JSON.stringify({ message: "The OpenCode server is unavailable." })
        res.writeHead(502, {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(payload),
          "cache-control": "no-store",
        })
        res.end(payload)
      })
      res.on("close", () => {
        clear()
        if (!res.writableEnded) upstream.destroy()
      })
      req.on("aborted", () => upstream.destroy())
      req.pipe(upstream)
    }
    
    function bufferJson(req, limit = 1024 * 1024) {
      return new Promise((resolve, reject) => {
        let size = 0
        const chunks = []
        req.on("data", (chunk) => {
          size += chunk.length
          if (size > limit) {
            reject(new Error("Request body too large"))
            req.destroy()
            return
          }
          chunks.push(chunk)
        })
        req.on("end", () => {
          const raw = Buffer.concat(chunks)
          let body
          try {
            body = raw.length ? JSON.parse(raw.toString("utf8")) : undefined
          } catch {
            body = undefined
          }
          resolve({ body, raw })
        })
        req.on("error", reject)
      })
    }
    
    function sendJson(res, status, body, headers) {
      const payload = JSON.stringify(body)
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(payload),
        "cache-control": "no-store",
        ...headers,
      })
      res.end(payload)
    }
    
    function tunnel(endpoint, pathname, search, client, head, headers, options = {}) {
      const url = upstreamUrl(endpoint, pathname, search)
      const secure = url.protocol === "https:"
      const port = Number(url.port || (secure ? 443 : 80))
      const host = url.hostname
      let upstream
      if (secure) {
        upstream = tls.connect({ host, port, servername: host, rejectUnauthorized: true })
      } else {
        upstream = net.connect({ host, port })
      }
      upstream.setNoDelay(true)
      client.setNoDelay(true)
      client.pause()
      const connectTimer = setTimeout(() => {
        upstream.destroy()
        client.destroy()
      }, 10000)
    
      const lines = [`GET ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`, "Connection: Upgrade", "Upgrade: websocket"]
      for (const name of ["sec-websocket-key", "sec-websocket-version", "sec-websocket-protocol", "sec-websocket-extensions"]) {
        const value = headers && headers[name]
        if (value) lines.push(`${name.replace(/\b\w/g, (letter) => letter.toUpperCase())}: ${value}`)
      }
      if (endpoint.headers && endpoint.headers.authorization) lines.push(`Authorization: ${endpoint.headers.authorization}`)
      lines.push("", "")
    
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        clearTimeout(connectTimer)
        upstream.destroy()
        client.destroy()
      }
    
      upstream.once(secure ? "secureConnect" : "connect", () => {
        clearTimeout(connectTimer)
        upstream.write(lines.join("\r\n"))
        if (head && head.length) upstream.write(head)
        upstream.pipe(client)
        client.pipe(upstream)
        client.resume()
      })
      upstream.on("error", close)
      client.on("error", close)
      client.on("close", close)
      upstream.on("close", close)
      if (options.onSocket) options.onSocket({ upstream, client, close })
    }
    
    module.exports = {
      upstreamUrl,
      requestHeaders,
      responseHeaders,
      requestJson,
      proxy,
      bufferJson,
      sendJson,
      tunnel,
    }
    
  },
  "core/merge.js": function (module, exports, require) {
    "use strict"
    
    const { randomId } = require("@b/core/util.js")
    
    function mergeProjects(entries) {
      const byWorktree = new Map()
      for (const entry of entries) {
        if (!entry || !Array.isArray(entry.data)) continue
        for (const project of entry.data) {
          if (!project || typeof project !== "object") continue
          const key = project.worktree || project.canonical || project.id
          if (typeof key !== "string" || !key) continue
          if (!byWorktree.has(key)) byWorktree.set(key, { project, serverId: entry.serverId })
        }
      }
      return [...byWorktree.values()]
    }
    
    function mergeSessionPages(entries) {
      const byId = new Map()
      const next = {}
      for (const entry of entries) {
        if (!entry || !entry.data || typeof entry.data !== "object") continue
        const items = Array.isArray(entry.data.data) ? entry.data.data : []
        for (const session of items) {
          if (!session || typeof session !== "object" || typeof session.id !== "string") continue
          if (!byId.has(session.id)) byId.set(session.id, { session, serverId: entry.serverId })
        }
        const cursor = entry.data.cursor && typeof entry.data.cursor === "object" ? entry.data.cursor : undefined
        if (cursor && typeof cursor.next === "string" && cursor.next) next[entry.serverId] = cursor.next
      }
      return { data: [...byId.values()], next }
    }
    
    function itemsOf(value) {
      if (Array.isArray(value)) return value
      if (value && typeof value === "object" && Array.isArray(value.data)) return value.data
      return []
    }
    
    function mergeArrays(entries) {
      const result = []
      for (const entry of entries) {
        for (const item of itemsOf(entry && entry.data)) if (item && typeof item === "object") result.push(item)
      }
      return result
    }
    
    function rewriteInfo(info, baseUrl, fallbackVersion) {
      const source = info && typeof info === "object" ? info : {}
      return {
        version: typeof source.version === "string" && source.version ? source.version : fallbackVersion,
        pid: 0,
        urls: [baseUrl],
        paths: { tmp: "/tmp" },
      }
    }
    
    function connectedEvent() {
      return { id: randomId("evt_", 10), type: "server.connected", data: {} }
    }
    
    module.exports = {
      mergeProjects,
      mergeSessionPages,
      mergeArrays,
      itemsOf,
      rewriteInfo,
      connectedEvent,
    }
    
  },
  "core/sse.js": function (module, exports, require) {
    "use strict"
    
    function createSseReader(onFrame) {
      let buffer = ""
      return {
        push(chunk) {
          buffer += chunk.toString("utf8")
          for (;;) {
            const match = /\r?\n\r?\n/.exec(buffer)
            if (!match) break
            const frame = buffer.slice(0, match.index)
            buffer = buffer.slice(match.index + match[0].length)
            if (frame) onFrame(frame)
          }
          if (buffer.length > 1024 * 1024) buffer = ""
        },
        end() {
          if (buffer.trim()) onFrame(buffer)
          buffer = ""
        },
      }
    }
    
    function frameFromEvent(event) {
      return `data: ${JSON.stringify(event)}`
    }
    
    function writeFrame(res, frame) {
      if (res.destroyed || res.writableEnded) return false
      const ok = res.write(`${frame}\n\n`)
      if (res.writableLength > 2 * 1024 * 1024) {
        res.destroy()
        return false
      }
      return ok
    }
    
    module.exports = { createSseReader, frameFromEvent, writeFrame }
    
  },
  "core/bridge.js": function (module, exports, require) {
    "use strict"
    
    const http = require("node:http")
    const { classify, stripBasePath, directoryFromBody, directoryFromQuery, encodeCursor, decodeCursor } = require("@b/core/routing.js")
    const { requestJson, bufferJson, sendJson, proxy, tunnel } = require("@b/core/http.js")
    const { mergeProjects, mergeSessionPages, mergeArrays, itemsOf, rewriteInfo, connectedEvent } = require("@b/core/merge.js")
    const { createSseReader, frameFromEvent, writeFrame } = require("@b/core/sse.js")
    const { errorMessage, truncate } = require("@b/core/util.js")
    
    const SESSION_TIMEOUT = 8000
    const INFO_TTL = 30 * 1000
    const CONNECT_TTL = 5 * 60 * 1000
    const MAX_ATTEMPTS = 10
    const MAX_SSE_PER_DEVICE = 8
    const MAX_SSE_TOTAL = 128
    const MAX_WS_PER_DEVICE = 16
    const MAX_WS_TOTAL = 128
    
    function createBridge(options) {
      const resolveServer = options.resolveServer
      const servers = options.servers
      const configServer = options.configServer
      const redeem = options.redeem
      const issuePairing = options.issuePairing
      const devices = options.devices
      const control = options.control
      const appVersion = options.appVersion || "0.0.0"
      const baseUrl = options.baseUrl || (() => `http://127.0.0.1:${state.port}`)
      const log = options.log || (() => {})
    
      const state = {
        server: undefined,
        host: "127.0.0.1",
        port: 0,
        basePath: "",
        running: false,
        sockets: new Set(),
        sse: new Set(),
        ws: new Set(),
        sessions: new Map(),
        ptys: new Map(),
        projects: new Map(),
        directories: new Map(),
        fsRoots: new Map(),
        saved: new Map(),
        attempts: new Map(),
        info: undefined,
      }
    
      function serversNow() {
        try {
          const list = servers()
          return Array.isArray(list) ? list : []
        } catch (error) {
          log("warn", "bridge server list failed", { error: errorMessage(error) })
          return []
        }
      }
    
      function targets() {
        const result = []
        for (const item of serversNow()) {
          const endpoint = resolveServer(item.id)
          if (endpoint && typeof endpoint.url === "string") result.push({ id: item.id, name: item.name || item.id, endpoint })
        }
        return result
      }
    
      function targetFor(serverId) {
        if (!serverId) return undefined
        const item = serversNow().find((server) => server.id === serverId)
        if (!item) return undefined
        const endpoint = resolveServer(item.id)
        return endpoint ? { id: item.id, name: item.name || item.id, endpoint } : undefined
      }
    
      function configTarget() {
        let id
        try {
          id = configServer()
        } catch {
          id = undefined
        }
        return targetFor(id) || targets()[0]
      }
    
      function publicBase() {
        const value = String(baseUrl() || "").replace(/\/+$/, "")
        return value || `http://127.0.0.1:${state.port}`
      }
    
      // The admin API changes the catalog and holds the admin token. It stays on
      // this computer even when the data plane is reachable through a tunnel.
      function adminAllowed(req) {
        const host = req.headers.host
        if (typeof host !== "string" || !host) return false
        let hostname
        try {
          hostname = new URL(`http://${host}`).hostname
        } catch {
          return false
        }
        return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]"
      }
    
      function addDirectory(directory, serverId) {
        if (typeof directory !== "string" || !directory) return
        const owners = state.directories.get(directory) || new Set()
        owners.add(serverId)
        state.directories.set(directory, owners)
      }
    
      function indexProject(serverId, project) {
        if (!project || typeof project !== "object") return
        if (typeof project.id === "string" && project.id) state.projects.set(project.id, serverId)
        addDirectory(project.worktree, serverId)
        addDirectory(project.canonical, serverId)
      }
    
      function indexSession(serverId, session) {
        if (!session || typeof session !== "object" || typeof session.id !== "string" || !session.id) return
        state.sessions.set(session.id, serverId)
        if (typeof session.projectID === "string" && session.projectID) state.projects.set(session.projectID, serverId)
        if (session.location && typeof session.location.directory === "string") addDirectory(session.location.directory, serverId)
      }
    
      function indexPty(serverId, pty) {
        if (!pty || typeof pty !== "object") return
        const id = pty.id || pty.ptyID
        if (typeof id === "string" && id) state.ptys.set(id, serverId)
      }
    
      function pickDirectory(directory) {
        if (typeof directory !== "string" || !directory) return configTarget()
        const owners = state.directories.get(directory)
        if (owners && owners.size === 1) {
          const target = targetFor([...owners][0])
          if (target) return target
        }
        // Longest known ancestor keeps browsing inside an unlisted child of a known folder.
        let best
        let bestLength = -1
        for (const [known, set] of state.directories) {
          if (!known || !known.trim() || set.size !== 1) continue
          const head = known.replace(/[\\/]+$/, "")
          if (directory === known || directory.startsWith(`${head}/`) || directory.startsWith(`${head}\\`)) {
            if (known.length > bestLength) {
              best = [...set][0]
              bestLength = known.length
            }
          }
        }
        return targetFor(best) || configTarget()
      }
    
      function fsSegments(value) {
        return String(value || "").split(/[\\/]+/).filter(Boolean)
      }
    
      function fsServersActive() {
        return targets().length > 1
      }
    
      // Virtual roots are namespaced so a server name cannot be mistaken for a real folder.
      function fsServers() {
        const result = []
        const counts = new Map()
        for (const target of targets()) {
          const base = String(target.name || target.id).replace(/[\\/@]/g, " ").replace(/\s+/g, " ").trim() || target.id
          const count = counts.get(base) || 0
          counts.set(base, count + 1)
          result.push({ slug: `@${count ? `${base} (${count + 1})` : base}`, target })
        }
        return result
      }
    
      function fsVirtual(directory) {
        if (!fsServersActive()) return undefined
        const segments = fsSegments(directory)
        if (!segments.length) return undefined
        const servers = fsServers()
        for (let index = 0; index < segments.length; index += 1) {
          const match = servers.find((item) => item.slug === segments[index])
          if (match) return { target: match.target, rest: segments.slice(index + 1) }
        }
        return undefined
      }
    
      function fsBase(target) {
        const stored = state.fsRoots.get(target.id)
        return typeof stored === "string" && stored ? stored : "/"
      }
    
      function fsJoin(base, parts) {
        const separator = String(base).includes("\\") ? "\\" : "/"
        const head = String(base || "").replace(/[\\/]+$/, "")
        if (!parts.length) return head || separator
        return `${head}${separator}${parts.join(separator)}`
      }
    
      function fsAbsolute(value) {
        return typeof value === "string" && (value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\"))
      }
    
      function fsRoot(value) {
        return value === "" || value === "/" || /^[a-zA-Z]:[\\/]?$/.test(value)
      }
    
      function fsQuery(directory) {
        const params = new URLSearchParams()
        params.set("location[directory]", directory)
        params.set("path", directory)
        return `?${params.toString()}`
      }
    
      function locationQuery(search, directory) {
        const params = new URLSearchParams(search || "")
        params.delete("directory")
        params.delete("path")
        params.set("location[directory]", directory)
        const value = params.toString()
        return value ? `?${value}` : ""
      }
    
      function fsEntries(body) {
        if (Array.isArray(body)) return body
        if (body && typeof body === "object" && Array.isArray(body.data)) return body.data
        return []
      }
    
      function sendUpstream(res, result) {
        if (result.body === undefined) {
          res.writeHead(result.status, { "cache-control": "no-store" })
          res.end()
          return
        }
        sendJson(res, result.status, result.body)
      }
    
      function fsEntryName(entry) {
        const parts = entry && typeof entry.path === "string" ? fsSegments(entry.path) : []
        if (parts.length) return parts[parts.length - 1]
        return entry && typeof entry.name === "string" && entry.name ? entry.name : undefined
      }
    
      function learnDirectory(directory, serverId) {
        if (fsRoot(directory)) return
        addDirectory(directory, serverId)
      }
    
      function dropServer(serverId) {
        for (const [id, owner] of state.sessions) if (owner === serverId) state.sessions.delete(id)
        for (const [id, owner] of state.ptys) if (owner === serverId) state.ptys.delete(id)
        for (const [id, owner] of state.projects) if (owner === serverId) state.projects.delete(id)
        for (const [id, owner] of state.saved) if (owner === serverId) state.saved.delete(id)
        state.fsRoots.delete(serverId)
        for (const [directory, owners] of state.directories) {
          owners.delete(serverId)
          if (!owners.size) state.directories.delete(directory)
        }
      }
    
      function learnFrame(serverId, frame) {
        if (!frame.includes("sessionID") && !frame.includes("sessionId")) return
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n")
        if (!data) return
        try {
          const event = JSON.parse(data)
          const payload = event && event.data && typeof event.data === "object" ? event.data : event
          const id = payload && (payload.sessionID || payload.sessionId)
          if (typeof id === "string" && id) state.sessions.set(id, serverId)
        } catch {
          // Events are forwarded byte-for-byte; a frame the bridge cannot parse is still valid for the client.
        }
      }
    
      function learnProjects(entry) {
        if (!entry || !Array.isArray(entry.data)) return
        for (const project of entry.data) indexProject(entry.serverId, project)
      }
    
      function learnSessions(entry) {
        if (!entry || !entry.data || !Array.isArray(entry.data.data)) return
        for (const session of entry.data.data) indexSession(entry.serverId, session)
      }
    
      function multipleServers() {
        return targets().length > 1
      }
    
      function serverName(serverId) {
        const item = serversNow().find((server) => server.id === serverId)
        return item && item.name ? item.name : serverId
      }
    
      function withServerTitle(serverId, title) {
        if (!multipleServers() || typeof title !== "string" || !title) return title
        const prefix = `${serverName(serverId)} · `
        return title.startsWith(prefix) ? title : `${prefix}${title}`
      }
    
      function withoutServerTitle(serverId, title) {
        if (!multipleServers() || typeof title !== "string") return title
        const prefix = `${serverName(serverId)} · `
        return title.startsWith(prefix) ? title.slice(prefix.length) : title
      }
    
      function sessionTitle(serverId, session) {
        if (!session || typeof session !== "object" || typeof session.id !== "string") return session
        return { ...session, title: withServerTitle(serverId, session.title) }
      }
    
      function sessionBody(serverId, body) {
        if (!body || typeof body !== "object") return body
        if (Array.isArray(body)) return body.map((session) => sessionTitle(serverId, session))
        if (Array.isArray(body.data)) return { ...body, data: body.data.map((session) => sessionTitle(serverId, session)) }
        if (body.data && typeof body.data === "object") return { ...body, data: sessionTitle(serverId, body.data) }
        return sessionTitle(serverId, body)
      }
    
      function baseName(value) {
        const parts = fsSegments(value)
        return parts.length ? parts[parts.length - 1] : String(value || "")
      }
    
      function credential(req, url) {
        const header = req.headers.authorization
        if (typeof header === "string") {
          const basic = /^Basic\s+(.+)$/i.exec(header)
          if (basic) {
            try {
              const decoded = Buffer.from(basic[1], "base64").toString("utf8")
              const separator = decoded.indexOf(":")
              if (separator >= 0) return decoded.slice(separator + 1)
            } catch {
              return undefined
            }
          }
          const bearer = /^Bearer\s+(.+)$/i.exec(header)
          if (bearer) return bearer[1].trim()
        }
        const query = url.searchParams.get("auth_token")
        if (!query) return undefined
        try {
          const decoded = Buffer.from(query, "base64").toString("utf8")
          if (decoded.includes(":")) return decoded.slice(decoded.indexOf(":") + 1)
        } catch {
          // A raw token is accepted as a fallback for clients that cannot set headers.
        }
        return query
      }
    
      function authenticate(req, url) {
        const token = credential(req, url)
        if (!token) return undefined
        const device = devices.verify(token)
        if (!device) return undefined
        return device
      }
    
      function unauthorized(res) {
        sendJson(res, 401, { message: "Authentication required" }, { "www-authenticate": 'Basic realm="opencode"' })
      }
    
      function rateLimited(ip) {    const now = Date.now()
        const entry = state.attempts.get(ip)
        if (!entry || entry.reset <= now) {
          state.attempts.set(ip, { count: 1, reset: now + 60 * 1000 })
          return false
        }
        entry.count += 1
        return entry.count > MAX_ATTEMPTS
      }
    
      function deviceName(req) {
        const agent = String(req.headers["user-agent"] || "")
        const product = agent.split(/[()]/)[0].trim()
        return truncate(product || "OpenCode device", 60)
      }
    
      function countSse(deviceId) {
        let count = 0
        for (const client of state.sse) if (client.deviceId === deviceId) count += 1
        return count
      }
    
      function countWs(deviceId) {
        let count = 0
        for (const entry of state.ws) if (entry.deviceId === deviceId) count += 1
        return count
      }
    
      async function handlePair(req, res, code) {
        if (typeof code !== "string" || !code || code.length > 256) {
          sendJson(res, 400, { message: "Invalid pairing code" })
          return
        }
        const ip = req.socket.remoteAddress || "unknown"
        if (rateLimited(ip)) {
          sendJson(res, 429, { message: "Too many pairing attempts. Try again in a minute." }, { "retry-after": "60" })
          return
        }
        try {
          const ok = await redeem(code)
          if (!ok) {
            sendJson(res, 401, { message: "This pairing link expired or was already used." })
            return
          }
          const result = devices.create(deviceName(req))
          sendJson(res, 200, { token: result.token })
        } catch (error) {
          log("warn", "bridge pairing redeem failed", { error: errorMessage(error) })
          sendJson(res, 503, { message: "OpenCode Desktop is not ready to pair. Try again." })
        }
      }
    
      async function readInfo() {
        if (state.info && Date.now() - state.info.at < INFO_TTL) return state.info.value
        const target = configTarget()
        if (target) {
          try {
            const result = await requestJson(target.endpoint, "/api/info", "", { timeoutMs: 2000 })
            if (result.status >= 200 && result.status < 300 && result.body) {
              const value = rewriteInfo(result.body, publicBase(), appVersion)
              state.info = { at: Date.now(), value }
              return value
            }
          } catch (error) {
            log("debug", "bridge info read failed", { server: target.id, error: errorMessage(error) })
          }
        }
        if (state.info) return state.info.value
        return rewriteInfo(undefined, publicBase(), appVersion)
      }
    
      async function handleInfo(res) {
        sendJson(res, 200, await readInfo())
      }
    
      async function handleHealth(res) {
        const info = await readInfo()
        sendJson(res, 200, { healthy: true, version: info.version })
      }
    
      async function collect(pathname, search) {
        const list = targets()
        if (!list.length) return []
        const results = await Promise.allSettled(
          list.map((target) => requestJson(target.endpoint, pathname, search, { timeoutMs: SESSION_TIMEOUT })),
        )
        const entries = []
        results.forEach((result, index) => {
          if (result.status === "fulfilled" && result.value.status >= 200 && result.value.status < 300) {
            entries.push({ serverId: list[index].id, data: result.value.body })
          } else {
            log("warn", "bridge upstream read failed", {
              server: list[index].id,
              status: result.status === "fulfilled" ? result.value.status : undefined,
              error: result.status === "rejected" ? errorMessage(result.reason) : undefined,
            })
          }
        })
        return entries
      }
    
      async function handleProjects(res, searchParams) {
        const search = searchParams.toString() ? `?${searchParams.toString()}` : ""
        const entries = await collect("/api/project", search)
        for (const entry of entries) learnProjects(entry)
        if (!entries.length && targets().length) {
          sendJson(res, 502, { message: "No OpenCode server is reachable." })
          return
        }
        const many = multipleServers()
        sendJson(
          res,
          200,
          mergeProjects(entries).map((item) => {
            if (!many) return item.project
            const project = item.project
            const label = typeof project.name === "string" && project.name ? project.name : baseName(project.worktree || project.canonical || project.id)
            return { ...project, name: `${serverName(item.serverId)} · ${label}` }
          }),
        )
      }
    
      async function handleSessions(res, searchParams) {
        const provided = searchParams.get("cursor")
        const perServer = provided ? decodeCursor(provided) : {}
        if (provided && !perServer) {
          sendJson(res, 400, { message: "Invalid cursor" })
          return
        }
        const list = targets()
        if (!list.length) {
          sendJson(res, 502, { message: "No OpenCode server is reachable." })
          return
        }
        const entries = []
        await Promise.all(
          list.map(async (target) => {
            if (provided && !perServer[target.id]) return
            const params = new URLSearchParams(searchParams)
            params.delete("cursor")
            if (perServer[target.id]) params.set("cursor", perServer[target.id])
            const search = params.toString() ? `?${params.toString()}` : ""
            try {
              const result = await requestJson(target.endpoint, "/api/session", search, { timeoutMs: SESSION_TIMEOUT })
              if (result.status >= 200 && result.status < 300) entries.push({ serverId: target.id, data: result.body })
            } catch (error) {
              log("warn", "bridge session page failed", { server: target.id, error: errorMessage(error) })
            }
          }),
        )
        const merged = mergeSessionPages(entries)
        for (const item of merged.data) indexSession(item.serverId, item.session)
        if (!entries.length) {
          sendJson(res, 502, { message: "No OpenCode server is reachable." })
          return
        }
        const next = Object.keys(merged.next).length ? { next: encodeCursor(merged.next) } : {}
        sendJson(res, 200, { data: merged.data.map((item) => sessionTitle(item.serverId, item.session)), cursor: next })
      }
    
      async function handleDirectorySessions(res, directory, pathname, search) {
        const target = pickDirectory(directory)
        if (!target) {
          sendJson(res, 503, { message: "No OpenCode server is reachable." })
          return
        }
        try {
          const result = await requestJson(target.endpoint, pathname, search, { timeoutMs: SESSION_TIMEOUT })
          if (result.status >= 200 && result.status < 300) {
            for (const session of itemsOf(result.body)) indexSession(target.id, session)
          }
          sendUpstream(res, { status: result.status, body: sessionBody(target.id, result.body) })
        } catch (error) {
          sendJson(res, 502, { message: "The OpenCode server is unavailable." })
        }
      }
    
      async function handleActive(res) {
        const entries = await collect("/api/session/active", "")
        if (!entries.length && targets().length) {
          sendJson(res, 502, { message: "No OpenCode server is reachable." })
          return
        }
        const merged = {}
        for (const entry of entries) {
          if (!entry.data || typeof entry.data !== "object" || Array.isArray(entry.data)) continue
          const map = entry.data.data && typeof entry.data.data === "object" && !Array.isArray(entry.data.data)
            ? entry.data.data
            : entry.data
          for (const id of Object.keys(map)) {
            merged[id] = map[id]
            state.sessions.set(id, entry.serverId)
          }
        }
        sendJson(res, 200, { data: merged })
      }
    
      async function handleArrayCollection(res, pathname, search, shape) {
        const entries = await collect(pathname, search)
        const items = mergeArrays(entries)
        if (shape === "permissions" || shape === "forms") {
          for (const entry of entries) {
            for (const item of itemsOf(entry.data)) {
              const sessionID = item && (item.sessionID || item.sessionId)
              if (typeof sessionID === "string" && sessionID) state.sessions.set(sessionID, entry.serverId)
            }
          }
        }
        if (shape === "saved") {
          for (const entry of entries) {
            for (const item of itemsOf(entry.data)) if (item && item.id) state.saved.set(item.id, entry.serverId)
          }
        }
        if (shape === "pty") {
          for (const entry of entries) {
            for (const item of itemsOf(entry.data)) indexPty(entry.serverId, item)
          }
        }
        if (!entries.length && targets().length) {
          sendJson(res, 502, { message: "No OpenCode server is reachable." })
          return
        }
        sendJson(res, 200, shape === "permissions" || shape === "forms" || shape === "saved" || shape === "pty" ? { data: items } : items)
      }
    
      async function discoverSession(id) {
        const list = targets()
        const results = await Promise.allSettled(
          list.map((target) =>
            requestJson(target.endpoint, `/api/session/${encodeURIComponent(id)}`, "", { timeoutMs: 5000 }).then((result) => ({
              target,
              result,
            })),
          ),
        )
        for (const item of results) {
          if (item.status !== "fulfilled") continue
          const { target, result } = item.value
          if (result.status < 200 || result.status >= 300) continue
          const session = result.body && result.body.data ? result.body.data : result.body
          if (session && typeof session.id === "string" && session.id === id) {
            indexSession(target.id, session)
            return target
          }
        }
        return undefined
      }
    
      async function routeSession(req, res, id, pathname, search) {
        let target = targetFor(state.sessions.get(id))
        if (!target) target = await discoverSession(id)
        if (!target) {
          sendJson(res, 404, { message: "This session is no longer available." })
          return
        }
        const item = /^\/(?:api|api\/experimental)\/session\/[^/]+\/?$/.test(pathname)
        if (item && req.method === "GET") {
          try {
            const result = await requestJson(target.endpoint, pathname, search, { timeoutMs: SESSION_TIMEOUT })
            sendUpstream(res, { status: result.status, body: sessionBody(target.id, result.body) })
          } catch (error) {
            sendJson(res, 502, { message: "The OpenCode server is unavailable." })
          }
          return
        }
        if (item && req.method === "PATCH") {
          let body
          try {
            body = (await bufferJson(req, 1024 * 1024)).body
          } catch (error) {
            sendJson(res, 400, { message: errorMessage(error) })
            return
          }
          const next = body && typeof body === "object" && !Array.isArray(body) ? body : {}
          // The list shows a prefixed title; never write that prefix back upstream.
          if (typeof next.title === "string") next.title = withoutServerTitle(target.id, next.title)
          try {
            const result = await requestJson(target.endpoint, pathname, search, {
              method: "PATCH",
              body: JSON.stringify(next),
              headers: { "content-type": "application/json" },
              timeoutMs: 30000,
            })
            sendUpstream(res, { status: result.status, body: sessionBody(target.id, result.body) })
          } catch (error) {
            sendJson(res, 502, { message: "The OpenCode server is unavailable." })
          }
          return
        }
        proxy(req, res, target.endpoint, pathname, search)
      }
    
      function routePty(req, res, id, pathname, search) {
        const target = targetFor(state.ptys.get(id)) || configTarget()
        if (!target) {
          sendJson(res, 503, { message: "No OpenCode server is reachable." })
          return
        }
        proxy(req, res, target.endpoint, pathname, search)
      }
    
      async function listVirtualDirectory(res, virtual) {
        const { target, rest } = virtual
        let base = fsBase(target)
        let directory = rest.length ? fsJoin(base, rest) : base
        let result
        try {
          result = await requestJson(target.endpoint, "/api/fs/list", fsQuery(directory), { timeoutMs: SESSION_TIMEOUT })
        } catch (error) {
          sendJson(res, 502, { message: "The OpenCode server is unavailable." })
          return
        }
        // Windows servers cannot list "/"; anchor their tree on the default location instead.
        if ((result.status < 200 || result.status >= 300) && !rest.length && fsRoot(base)) {
          const fallback = await requestJson(target.endpoint, "/api/location", "", { timeoutMs: SESSION_TIMEOUT }).catch(() => undefined)
          const location = fallback && fallback.body && typeof fallback.body.data === "object" ? fallback.body.data : fallback && fallback.body
          const directoryFallback = location && typeof location.directory === "string" ? location.directory : undefined
          if (directoryFallback) {
            base = directoryFallback
            directory = base
            try {
              result = await requestJson(target.endpoint, "/api/fs/list", fsQuery(directory), { timeoutMs: SESSION_TIMEOUT })
            } catch (error) {
              sendJson(res, 502, { message: "The OpenCode server is unavailable." })
              return
            }
          }
        }
        if (result.status < 200 || result.status >= 300) {
          sendJson(res, result.status, result.body || { message: "The OpenCode server is unavailable." })
          return
        }
        if (!rest.length) state.fsRoots.set(target.id, base)
        learnDirectory(directory, target.id)
        const data = []
        for (const entry of fsEntries(result.body)) {
          const name = fsEntryName(entry)
          if (name) data.push({ path: name, type: entry.type === "directory" ? "directory" : "file" })
        }
        sendJson(res, 200, { location: { directory }, data })
      }
    
      // The phone's add-project browser asks for absolute paths. Serve them across
      // servers: "/" names the exposed servers, "/@server/..." browses one machine.
      async function handleFsList(req, res, classified, search) {
        const path = classified.path
        if (!fsAbsolute(path)) {
          await routeDirectory(req, res, classified, "/api/fs/list", search)
          return
        }
        const virtual = fsVirtual(path)
        // "/" is the server list. The add-project browser also seeds its location
        // with the first folder, so that first listing opens on the servers too.
        const roots = fsServersActive() && !virtual && (fsRoot(path) || classified.directory === path)
        if (roots) {
          sendJson(res, 200, {
            location: { directory: path },
            data: fsServers().map(({ slug }) => ({ path: slug, type: "directory" })),
          })
          return
        }
        if (virtual) {
          await listVirtualDirectory(res, virtual)
          return
        }
        const target = pickDirectory(path)
        if (!target) {
          sendJson(res, 503, { message: "No OpenCode server is reachable." })
          return
        }
        try {
          const result = await requestJson(target.endpoint, "/api/fs/list", fsQuery(path), { timeoutMs: SESSION_TIMEOUT })
          if (result.status < 200 || result.status >= 300) {
            sendJson(res, result.status, result.body || { message: "The OpenCode server is unavailable." })
            return
          }
          learnDirectory(path, target.id)
          const body = result.body && typeof result.body === "object" && !Array.isArray(result.body) ? result.body : {}
          const data = [...fsEntries(body)]
          if (fsServersActive()) for (const { slug } of fsServers()) data.push({ path: slug, type: "directory" })
          sendJson(res, 200, { ...body, data })
        } catch (error) {
          sendJson(res, 502, { message: "The OpenCode server is unavailable." })
        }
      }
    
      async function routeDirectory(req, res, classified, pathname, search) {
        const virtual = fsVirtual(classified.directory)
        let target
        let routeSearch = search
        if (virtual) {
          target = virtual.target
          const directory = virtual.rest.length ? fsJoin(fsBase(virtual.target), virtual.rest) : fsBase(virtual.target)
          routeSearch = locationQuery(search, directory)
        } else {
          if (classified.projectID) target = targetFor(state.projects.get(classified.projectID))
          if (!target && classified.directory) target = pickDirectory(classified.directory)
          if (!target) target = configTarget()
        }
        if (!target) {
          sendJson(res, 503, { message: "No OpenCode server is reachable." })
          return
        }
        if (pathname === "/api/location" && req.method === "GET") {
          try {
            const result = await requestJson(target.endpoint, pathname, routeSearch, { timeoutMs: SESSION_TIMEOUT })
            const location = result.body && result.body.data && typeof result.body.data === "object" ? result.body.data : result.body
            if (result.status >= 200 && result.status < 300 && location && location.project) {
              indexProject(target.id, location.project)
              if (typeof location.directory === "string") learnDirectory(location.directory, target.id)
            }
            if (virtual && location && typeof location.directory === "string") learnDirectory(location.directory, target.id)
            sendUpstream(res, result)
          } catch (error) {
            sendJson(res, 502, { message: "The OpenCode server is unavailable." })
          }
          return
        }
        proxy(req, res, target.endpoint, pathname, routeSearch)
      }
    
      async function createSession(req, res, pathname, search, queryDirectory) {
        let body
        try {
          body = (await bufferJson(req, 4 * 1024 * 1024)).body
        } catch (error) {
          sendJson(res, 400, { message: errorMessage(error) })
          return
        }
        const directory = directoryFromBody(body) || queryDirectory
        const target = pickDirectory(directory)
        if (!target) {
          sendJson(res, 503, { message: "No OpenCode server is reachable." })
          return
        }
        try {
          const result = await requestJson(target.endpoint, pathname, search, {
            method: "POST",
            body: JSON.stringify(body || {}),
            headers: { "content-type": "application/json" },
            timeoutMs: 30000,
          })
          const session = result.body && result.body.data ? result.body.data : result.body
          if (result.status >= 200 && result.status < 300) indexSession(target.id, session)
          sendJson(res, result.status, result.body || {})
        } catch (error) {
          sendJson(res, 502, { message: "The OpenCode server is unavailable." })
        }
      }
    
      async function createPty(req, res, pathname, search, classified) {
        let body
        try {
          body = (await bufferJson(req, 1024 * 1024)).body
        } catch (error) {
          sendJson(res, 400, { message: errorMessage(error) })
          return
        }
        const directory = classified.directory || directoryFromBody(body)
        const target = pickDirectory(directory)
        if (!target) {
          sendJson(res, 503, { message: "No OpenCode server is reachable." })
          return
        }
        try {
          const result = await requestJson(target.endpoint, pathname, search, {
            method: "POST",
            body: JSON.stringify(body || {}),
            headers: { "content-type": "application/json" },
            timeoutMs: 30000,
          })
          const pty = result.body && result.body.data ? result.body.data : result.body
          if (result.status >= 200 && result.status < 300) indexPty(target.id, pty)
          sendJson(res, result.status, result.body || {})
        } catch (error) {
          sendJson(res, 502, { message: "The OpenCode server is unavailable." })
        }
      }
    
      async function handleCapabilities(res) {
        sendJson(res, 200, {
          bridge: 1,
          name: "opencode-desktop-bridge",
          version: appVersion,
          servers: serversNow().length,
          exposed: targets().length,
        })
      }
    
      async function handleServers(res) {
        const selected = (() => {
          try {
            return configServer()
          } catch {
            return undefined
          }
        })()
        sendJson(res, 200, {
          data: serversNow().map((server) => ({
            name: server.name,
            connected: Boolean(server.connected),
            configServer: server.id === selected,
          })),
        })
      }
    
      async function handle(req, res) {
        const url = new URL(req.url || "/", "http://bridge.invalid")
        const pathname = stripBasePath(url.pathname, state.basePath)
        if (!pathname) {
          sendJson(res, 404, { message: "Not found" })
          return
        }
        if (control && control.match(pathname)) {
          if (!adminAllowed(req)) {
            sendJson(res, 403, { message: "The bridge admin API is available on this computer only." })
            return
          }
          await control.handle(req, res, pathname, url.searchParams)
          return
        }
        const classified = classify(req.method || "GET", pathname, url.searchParams)
        if (classified.kind === "pair") {
          await handlePair(req, res, classified.code)
          return
        }
        if (classified.kind === "not-found") {
          sendJson(res, 404, { message: "Not found" })
          return
        }
        const device = authenticate(req, url)
        if (!device) {
          unauthorized(res)
          return
        }
        // The bridge token is ours alone; never forward it upstream, even when the client used the query fallback.
        url.searchParams.delete("auth_token")
        const search = url.search || ""
    
        switch (classified.kind) {
          case "info":
            await handleInfo(res)
            return
          case "health":
            await handleHealth(res)
            return
          case "event":
            if (state.sse.size >= MAX_SSE_TOTAL || countSse(device.id) >= MAX_SSE_PER_DEVICE) {
              sendJson(res, 429, { message: "Too many open event streams." })
              return
            }
            openEvents(req, res, device)
            return
          case "pair-issue":
            try {
              if (!issuePairing) throw new Error("Pairing is not available.")
              const result = await issuePairing()
              sendJson(res, 200, { code: result.code, expires_in: result.expiresIn || 300 })
            } catch (error) {
              sendJson(res, 503, { message: "OpenCode Desktop is not ready to pair. Try again." })
            }
            return
          case "capabilities":
            await handleCapabilities(res)
            return
          case "servers":
            await handleServers(res)
            return
          case "projects":
            await handleProjects(res, url.searchParams)
            return
          case "project": {
            const target = targetFor(state.projects.get(classified.id)) || configTarget()
            if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
            proxy(req, res, target.endpoint, pathname, search)
            return
          }
          case "sessions":
            if (classified.directory) {
              await handleDirectorySessions(res, classified.directory, pathname, search)
              return
            }
            await handleSessions(res, url.searchParams)
            return
          case "session":
            await routeSession(req, res, classified.id, pathname, search)
            return
          case "session-create":
            await createSession(req, res, pathname, search, classified.directory)
            return
          case "active":
            await handleActive(res)
            return
          case "permissions":
            await handleArrayCollection(res, "/api/permission/request", search, "permissions")
            return
          case "forms":
            await handleArrayCollection(res, "/api/form", search, "forms")
            return
          case "saved-permissions":
            await handleArrayCollection(res, "/api/permission/saved", search, "saved")
            return
          case "saved-permission": {
            const target = targetFor(state.saved.get(classified.id)) || configTarget()
            if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
            proxy(req, res, target.endpoint, pathname, search)
            return
          }
          case "pty-list":
            if (classified.directory) {
              const target = pickDirectory(classified.directory)
              if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
              proxy(req, res, target.endpoint, pathname, search)
              return
            }
            await handleArrayCollection(res, "/api/pty", search, "pty")
            return
          case "pty":
            routePty(req, res, classified.id, pathname, search)
            return
          case "pty-create":
            await createPty(req, res, pathname, search, classified)
            return
          case "location":
          case "directory":
            await routeDirectory(req, res, classified, pathname, search)
            return
          case "fs-list":
            await handleFsList(req, res, classified, search)
            return
          case "config":
          default: {
            const directory = directoryFromQuery(url.searchParams)
            const target = directory ? pickDirectory(directory) : configTarget()
            if (!target) return sendJson(res, 503, { message: "No OpenCode server is reachable." })
            proxy(req, res, target.endpoint, pathname, search)
            return
          }
        }
      }
    
      function openEvents(req, res, device) {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        })
        res.flushHeaders()
        const client = {
          res,
          deviceId: device.id,
          upstreams: new Map(),
          closed: false,
          keepalive: undefined,
        }
        state.sse.add(client)
        writeFrame(res, frameFromEvent(connectedEvent()))
        client.keepalive = setInterval(() => {
          if (client.closed || res.destroyed || res.writableEnded) return
          res.write(": keepalive\n\n")
        }, 20000)
        client.keepalive.unref?.()
        const cleanup = () => {
          if (client.closed) return
          client.closed = true
          clearInterval(client.keepalive)
          for (const entry of client.upstreams.values()) {
            clearTimeout(entry.timer)
            entry.request?.destroy()
          }
          client.upstreams.clear()
          state.sse.delete(client)
        }
        res.on("close", cleanup)
        res.on("error", cleanup)
        for (const target of targets()) openUpstreamEvents(client, target)
      }
    
      function openUpstreamEvents(client, target, attempt = 0) {
        if (client.closed || !state.running) return
        const url = new URL(target.endpoint.url)
        url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/event`
        url.search = ""
        const lib = url.protocol === "https:" ? require("node:https") : require("node:http")
        const headers = { accept: "text/event-stream", "cache-control": "no-cache", ...(target.endpoint.headers || {}) }
        const controller = new AbortController()
        const connectTimer = setTimeout(() => controller.abort(), 30000)
        const request = lib.request(url, { method: "GET", headers, signal: controller.signal }, (response) => {
          clearTimeout(connectTimer)
          if (response.statusCode !== 200) {
            if (attempt === 0) {
              log("warn", "bridge event stream rejected", { server: target.id, status: response.statusCode })
            }
            response.resume()
            schedule()
            return
          }
          const reader = createSseReader((frame) => {
            learnFrame(target.id, frame)
            writeFrame(client.res, frame)
          })
          response.on("data", (chunk) => reader.push(chunk))
          response.on("end", () => {
            reader.end()
            schedule()
          })
          response.on("error", () => schedule())
          response.on("aborted", () => schedule())
        })
        const entry = { request, timer: undefined, attempt }
        client.upstreams.set(target.id, entry)
        let scheduled = false
        const schedule = () => {
          if (scheduled) return
          scheduled = true
          if (client.closed || !state.running) return
          if (client.upstreams.get(target.id) === entry) client.upstreams.delete(target.id)
          const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))
          entry.timer = setTimeout(() => {
            if (client.closed || !state.running) return
            const current = targets().find((item) => item.id === target.id)
            if (current) openUpstreamEvents(client, current, attempt + 1)
          }, delay)
          entry.timer.unref?.()
        }
        request.on("error", () => {
          clearTimeout(connectTimer)
          schedule()
        })
        request.end()
      }
    
      function notifyChanged() {
        const current = new Set(targets().map((target) => target.id))
        const owners = new Set([
          ...state.sessions.values(),
          ...state.ptys.values(),
          ...state.projects.values(),
          ...state.saved.values(),
        ])
        for (const serverId of owners) {
          if (!current.has(serverId) && serverId !== "unknown") dropServer(serverId)
        }
        for (const client of state.sse) {
          if (client.closed) continue
          for (const [serverId, entry] of client.upstreams) {
            if (current.has(serverId)) continue
            clearTimeout(entry.timer)
            entry.request?.destroy()
            client.upstreams.delete(serverId)
          }
          for (const target of targets()) {
            if (!client.upstreams.has(target.id)) openUpstreamEvents(client, target)
          }
          writeFrame(client.res, frameFromEvent(connectedEvent()))
        }
        state.info = undefined
      }
    
      function revokeDevice(id) {
        devices.revoke(id)
        for (const client of [...state.sse]) {
          if (client.deviceId === id) client.res.destroy()
        }
        for (const entry of [...state.ws]) {
          if (entry.deviceId === id) entry.close()
        }
      }
    
      function handleUpgrade(req, socket, head) {
        const url = new URL(req.url || "/", "http://bridge.invalid")
        const pathname = stripBasePath(url.pathname, state.basePath)
        if (!pathname) {
          socket.destroy()
          return
        }
        if (control && control.match(pathname)) {
          socket.destroy()
          return
        }
        const device = authenticate(req, url)
        if (!device) {
          socket.end('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="opencode"\r\nContent-Length: 0\r\n\r\n')
          return
        }
        url.searchParams.delete("auth_token")
        const classified = classify("GET", pathname, url.searchParams)
        if (state.ws.size >= MAX_WS_TOTAL || countWs(device.id) >= MAX_WS_PER_DEVICE) {
          socket.end("HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\n\r\n")
          return
        }
        let target
        if (classified.kind === "pty") target = targetFor(state.ptys.get(classified.id)) || configTarget()
        else if (classified.kind === "session") target = targetFor(state.sessions.get(classified.id)) || configTarget()
        else target = configTarget()
        if (!target) {
          socket.end("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n")
          return
        }
        tunnel(target.endpoint, pathname, url.search, socket, head, req.headers, {
          onSocket: (entry) => {
            const record = { ...entry, deviceId: device.id }
            state.ws.add(record)
            const remove = () => state.ws.delete(record)
            entry.client.on("close", remove)
            entry.client.on("error", remove)
          },
        })
      }
    
      async function start(input = {}) {
        await stop()
        state.host = input.host || state.host
        state.basePath = input.basePath || ""
        const port = input.port === undefined ? state.port : input.port
        const server = http.createServer((req, res) => {
          Promise.resolve(handle(req, res)).catch((error) => {
            log("error", "bridge request failed", { error: errorMessage(error) })
            if (!res.headersSent && !res.destroyed) sendJson(res, 500, { message: "Bridge error" })
            else res.destroy()
          })
        })
        server.on("upgrade", handleUpgrade)
        server.on("clientError", (error, socket) => {
          log("debug", "bridge client error", { error: errorMessage(error) })
          socket.destroy()
        })
        server.on("connection", (socket) => {
          state.sockets.add(socket)
          socket.on("close", () => state.sockets.delete(socket))
        })
        state.server = server
        await new Promise((resolve, reject) => {
          const onError = (error) => {
            server.removeListener("listening", onListening)
            reject(error)
          }
          const onListening = () => {
            server.removeListener("error", onError)
            const address = server.address()
            state.port = typeof address === "object" && address ? address.port : port
            resolve()
          }
          server.once("error", onError)
          server.once("listening", onListening)
          server.listen(port, state.host)
        })
        state.running = true
        log("info", "bridge listening", { host: state.host, port: state.port, basePath: state.basePath })
        return { host: state.host, port: state.port, basePath: state.basePath }
      }
    
      async function stop() {
        state.running = false
        for (const client of [...state.sse]) client.res.destroy()
        state.sse.clear()
        for (const entry of [...state.ws]) entry.close()
        state.ws.clear()
        for (const socket of [...state.sockets]) socket.destroy()
        state.sockets.clear()
        for (const entry of state.attempts) entry[1].reset = 0
        const server = state.server
        state.server = undefined
        if (!server) return
        await new Promise((resolve) => {
          server.close(() => resolve())
          setTimeout(resolve, 1000).unref?.()
        })
      }
    
      return {
        start,
        stop,
        notifyChanged,
        revokeDevice,
        get port() {
          return state.port
        },
        get host() {
          return state.host
        },
        get baseUrl() {
          return publicBase()
        },
        get running() {
          return state.running
        },
      }
    }
    
    module.exports = { createBridge }
    
  },
  "core/catalog.js": function (module, exports, require) {
    "use strict"
    
    const { sha256 } = require("@b/core/util.js")
    
    // Normalizes an upstream URL to the identity the catalog dedupes on.
    function normalizeUrl(value) {
      if (typeof value !== "string") return undefined
      let url
      try {
        url = new URL(value.trim())
      } catch {
        return undefined
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
      if (url.username || url.password) return undefined
      url.hash = ""
      url.search = ""
      return url.href.replace(/\/+$/, "")
    }
    
    function manualId(source, url) {
      return `${source}:${sha256(url).slice(0, 16)}`
    }
    
    // One list for every configuration source: Desktop's live servers, plus the
    // manual sources the TUI and web clients write through the control plane.
    function createCatalog(options) {
      const sources = Array.isArray(options.sources) ? options.sources : []
      const hidden = options.hidden || (() => [])
      const selected = options.configServer || (() => undefined)
      const log = options.log || (() => {})
    
      function hiddenSet() {
        try {
          const value = hidden()
          return value instanceof Set ? value : new Set(Array.isArray(value) ? value : [])
        } catch (error) {
          log("warn", "bridge hidden list failed", { error: String(error && error.message ? error.message : error) })
          return new Set()
        }
      }
    
      function all() {
        const seen = new Map()
        const ids = new Set()
        const result = []
        const excluded = hiddenSet()
        for (const source of sources) {
          let entries
          try {
            entries = source.entries()
          } catch (error) {
            log("warn", "bridge source failed", {
              source: source.id,
              error: String(error && error.message ? error.message : error),
            })
            continue
          }
          if (!Array.isArray(entries)) continue
          for (const raw of entries) {
            if (!raw || typeof raw.id !== "string" || !raw.id) continue
            const url = normalizeUrl(raw.url)
            if (!url || seen.has(url)) continue
            let id = raw.id
            if (ids.has(id)) id = `${source.id}:${id}`
            while (ids.has(id)) id = `${source.id}:${id}`
            ids.add(id)
            const entry = {
              id,
              name: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
              url,
              headers: raw.headers,
              source: source.id,
              connected: raw.connected !== false,
              builtin: Boolean(raw.builtin),
              local: Boolean(raw.local),
              exposed: !excluded.has(id),
            }
            seen.set(url, entry)
            result.push(entry)
          }
        }
        return result
      }
    
      function exposed() {
        return all().filter((entry) => entry.exposed)
      }
    
      function configServer() {
        const visible = exposed()
        if (!visible.length) return undefined
        let wanted
        try {
          wanted = selected()
        } catch {
          wanted = undefined
        }
        return (
          visible.find((entry) => entry.id === wanted) ||
          visible.find((entry) => entry.builtin) ||
          visible.find((entry) => entry.source === "desktop") ||
          visible[0]
        ).id
      }
    
      function resolve(id) {
        if (typeof id !== "string" || !id) return undefined
        const entry = all().find((item) => item.id === id)
        if (!entry) return undefined
        return { url: entry.url, headers: entry.headers }
      }
    
      function servers() {
        return exposed().map((entry) => ({
          id: entry.id,
          name: entry.name,
          connected: entry.connected,
          builtin: entry.builtin,
          local: entry.local,
          source: entry.source,
        }))
      }
    
      function snapshot() {
        const current = configServer()
        return all().map((entry) => ({
          id: entry.id,
          name: entry.name,
          connected: entry.connected,
          builtin: entry.builtin,
          local: entry.local,
          source: entry.source,
          exposed: entry.exposed,
          configServer: entry.id === current,
        }))
      }
    
      return { all, exposed, servers, resolve, configServer, snapshot }
    }
    
    module.exports = { createCatalog, normalizeUrl, manualId }
    
  },
  "core/control.js": function (module, exports, require) {
    "use strict"
    
    const { timingSafeEqual } = require("node:crypto")
    const { bufferJson, sendJson } = require("@b/core/http.js")
    const { normalizeUrl, manualId } = require("@b/core/catalog.js")
    
    const PREFIX = "/bridge/v1/admin"
    const MAX_BODY = 256 * 1024
    const MAX_SERVERS = 64
    
    const DEFAULT_SOURCES = [
      { id: "desktop", name: "OpenCode Desktop", writable: false },
      { id: "tui", name: "TUI", writable: true },
      { id: "web", name: "Web", writable: true },
    ]
    
    function createControlPlane(options) {
      const adminToken = options.adminToken
      const sources = Array.isArray(options.sources) && options.sources.length ? options.sources : DEFAULT_SOURCES
      const readSource = options.readSource
      const writeSource = options.writeSource
      const snapshot = options.snapshot || (() => [])
      const pair = options.pair
      const baseUrl = options.baseUrl || (() => "")
      const version = options.version || "0.0.0"
      const onChange = options.onChange || (() => {})
      const log = options.log || (() => {})
    
      function match(pathname) {
        return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`)
      }
    
      function cors(req, res) {
        const origin = req.headers.origin
        if (typeof origin !== "string" || !origin) return
        res.setHeader("access-control-allow-origin", origin)
        res.setHeader("vary", "Origin")
        res.setHeader("access-control-allow-headers", "authorization, content-type, x-bridge-admin-token")
        res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS")
        res.setHeader("access-control-max-age", "600")
        if (req.headers["access-control-request-private-network"] === "true") {
          res.setHeader("access-control-allow-private-network", "true")
        }
      }
    
      function tokenOf(req) {
        const header = req.headers.authorization
        if (typeof header === "string") {
          const bearer = /^Bearer\s+(.+)$/i.exec(header)
          if (bearer) return bearer[1].trim()
        }
        const custom = req.headers["x-bridge-admin-token"]
        return typeof custom === "string" ? custom.trim() : undefined
      }
    
      function authorized(req) {
        let expected
        try {
          expected = String(adminToken() || "")
        } catch {
          return false
        }
        if (!expected) return false
        const provided = tokenOf(req)
        if (!provided) return false
        const left = Buffer.from(provided)
        const right = Buffer.from(expected)
        return left.length === right.length && timingSafeEqual(left, right)
      }
    
      function sourceOf(id) {
        return sources.find((source) => source.id === id && source.writable)
      }
    
      function read(id) {
        const value = readSource(id)
        return Array.isArray(value) ? value : []
      }
    
      function redact(list) {
        return list.map((item) => ({
          id: item.id,
          name: item.name,
          url: item.url,
          hasPassword: Boolean(item.password),
        }))
      }
    
      function normalize(input, source) {
        if (!input || typeof input !== "object") throw new Error("A server object is required.")
        const url = normalizeUrl(input.url)
        if (!url) throw new Error("Use an http(s) URL without credentials.")
        if (url === normalizeUrl(baseUrl())) throw new Error("A source cannot point at this bridge.")
        const password = typeof input.password === "string" ? input.password : ""
        if (password.length > 1024) throw new Error("The password is too long.")
        const name = typeof input.name === "string" && input.name.trim()
          ? input.name.trim().slice(0, 120)
          : new URL(url).host
        return { id: manualId(source, url), name, url, password }
      }
    
      function list(source) {
        return {
          source: source.id,
          data: redact(read(source.id)),
        }
      }
    
      function replace(id, body) {
        const source = sourceOf(id)
        if (!source) return undefined
        if (!body || !Array.isArray(body.servers)) throw new Error("Expected a servers array.")
        if (body.servers.length > MAX_SERVERS) throw new Error(`At most ${MAX_SERVERS} servers are supported.`)
        const seen = new Set()
        const next = []
        for (const item of body.servers) {
          const entry = normalize(item, id)
          if (seen.has(entry.url)) continue
          seen.add(entry.url)
          next.push(entry)
        }
        writeSource(id, next)
        onChange(id, next)
        return list(source)
      }
    
      function add(id, body) {
        const source = sourceOf(id)
        if (!source) return undefined
        const entry = normalize(body, id)
        const current = read(id)
        if (!current.some((item) => item.url === entry.url) && current.length >= MAX_SERVERS) {
          throw new Error(`At most ${MAX_SERVERS} servers are supported.`)
        }
        const next = [entry, ...current.filter((item) => item.url !== entry.url)]
        writeSource(id, next)
        onChange(id, next)
        return list(source)
      }
    
      function remove(id, entryId) {
        const source = sourceOf(id)
        if (!source) return undefined
        const current = read(id)
        const next = current.filter((item) => item.id !== entryId)
        if (next.length === current.length) return undefined
        writeSource(id, next)
        onChange(id, next)
        return list(source)
      }
    
      function sourceList() {
        const servers = snapshot()
        return sources.map((source) => ({
          id: source.id,
          name: source.name,
          writable: source.writable,
          count: source.writable ? read(source.id).length : servers.filter((item) => item.source === source.id).length,
        }))
      }
    
      async function handle(req, res, pathname, searchParams) {
        cors(req, res)
        if (req.method === "OPTIONS") {
          res.writeHead(204, { "content-length": "0" })
          res.end()
          return
        }
        if (!authorized(req)) {
          sendJson(res, 401, { message: "Bridge admin token required." })
          return
        }
        const path = pathname.slice(PREFIX.length) || "/"
        try {
          if (req.method === "GET" && path === "/status") {
            sendJson(res, 200, {
              bridge: 1,
              version,
              baseUrl: baseUrl(),
              sources: sourceList(),
              servers: snapshot(),
            })
            return
          }
          if (req.method === "GET" && path === "/servers") {
            sendJson(res, 200, { data: snapshot(), sources: sourceList() })
            return
          }
          const sourcePath = /^\/sources\/([^/]+)$/.exec(path)
          if (req.method === "GET" && sourcePath) {
            const source = sourceOf(decodeURIComponent(sourcePath[1]))
            if (!source) {
              sendJson(res, 404, { message: "Unknown source." })
              return
            }
            sendJson(res, 200, list(source))
            return
          }
          const replacePath = /^\/servers\/([^/]+)$/.exec(path)
          if (replacePath) {
            const id = decodeURIComponent(replacePath[1])
            if (!sourceOf(id)) {
              sendJson(res, 404, { message: "Unknown source." })
              return
            }
            if (req.method === "PUT") {
              const body = (await bufferJson(req, MAX_BODY)).body
              sendJson(res, 200, replace(id, body))
              return
            }
            if (req.method === "POST") {
              const body = (await bufferJson(req, MAX_BODY)).body
              sendJson(res, 200, add(id, body))
              return
            }
          }
          const removePath = /^\/servers\/([^/]+)\/([^/]+)$/.exec(path)
          if (req.method === "DELETE" && removePath) {
            const id = decodeURIComponent(removePath[1])
            const entryId = decodeURIComponent(removePath[2])
            const result = remove(id, entryId)
            if (!result) {
              sendJson(res, 404, { message: "Server not found in this source." })
              return
            }
            sendJson(res, 200, result)
            return
          }
          if (req.method === "POST" && path === "/pair") {
            const result = await pair()
            sendJson(res, 200, { link: result.link, expiresAt: result.expiresAt })
            return
          }
          sendJson(res, 404, { message: "Not found" })
        } catch (error) {
          log("warn", "bridge control request failed", { path, error: error instanceof Error ? error.message : String(error) })
          if (!res.headersSent) sendJson(res, 400, { message: error instanceof Error ? error.message : "Invalid request." })
          else res.destroy()
        }
      }
    
      return { match, handle }
    }
    
    module.exports = { createControlPlane, PREFIX, DEFAULT_SOURCES }
    
  },
  "core/devices.js": function (module, exports, require) {
    "use strict"
    
    const { randomId, sha256, truncate } = require("@b/core/util.js")
    
    const TOKEN_PREFIX = "brg1_"
    const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000
    const MAX_DEVICES = 32
    const TOUCH_INTERVAL_MS = 60 * 1000
    
    function createDeviceStore(options) {
      const load = options.load
      const save = options.save
      const now = options.now || (() => Date.now())
      const ttl = options.ttlMs || DEFAULT_TTL_MS
      const log = options.log || (() => {})
    
      function read() {
        const value = load()
        return Array.isArray(value) ? value.filter((item) => item && typeof item.hash === "string") : []
      }
    
      function write(devices) {
        save(devices)
      }
    
      function list() {
        return read().map(({ id, name, createdAt, lastSeenAt, expiresAt }) => ({
          id,
          name,
          createdAt,
          lastSeenAt,
          expiresAt,
        }))
      }
    
      function create(name) {
        const devices = read()
        if (devices.length >= MAX_DEVICES) throw new Error("Too many paired devices. Revoke one first.")
        const token = `${TOKEN_PREFIX}${randomId("", 32)}`
        const record = {
          id: randomId("dev_", 8),
          name: truncate(name || "Device", 60) || "Device",
          hash: sha256(token),
          createdAt: now(),
          lastSeenAt: now(),
          expiresAt: now() + ttl,
        }
        write([...devices, record])
        log("info", "bridge device paired", { device: record.id })
        return { token, device: { id: record.id, name: record.name, createdAt: record.createdAt, expiresAt: record.expiresAt } }
      }
    
      function verify(token) {
        if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX) || token.length < 20) return undefined
        const hash = sha256(token)
        const devices = read()
        const record = devices.find((item) => item.hash === hash)
        if (!record) return undefined
        if (record.expiresAt <= now()) {
          write(devices.filter((item) => item.id !== record.id))
          log("info", "bridge device expired", { device: record.id })
          return undefined
        }
        if (now() - (record.lastSeenAt || 0) > TOUCH_INTERVAL_MS) {
          record.lastSeenAt = now()
          write(devices)
        }
        return { id: record.id, name: record.name, expiresAt: record.expiresAt }
      }
    
      function revoke(id) {
        const devices = read()
        const next = devices.filter((item) => item.id !== id)
        if (next.length === devices.length) return false
        write(next)
        log("info", "bridge device revoked", { device: id })
        return true
      }
    
      function rename(id, name) {
        const devices = read()
        const record = devices.find((item) => item.id === id)
        if (!record) return false
        record.name = truncate(name || record.name, 60) || record.name
        write(devices)
        return true
      }
    
      return { list, create, verify, revoke, rename }
    }
    
    module.exports = { createDeviceStore, TOKEN_PREFIX, MAX_DEVICES }
    
  },
  "core/registry.js": function (module, exports, require) {
    "use strict"
    
    // Desktop discovery only. The catalog decides exposure, the configuration
    // server and deduplication across Desktop, TUI and web sources.
    function createServerRegistry(options) {
      const getConfig = options.getConfig
      const setConfig = options.setConfig
      const onChange = options.onChange || (() => {})
      const windows = new Map()
      let lastSignature = ""
    
      function report(windowId, list) {
        const clean = (Array.isArray(list) ? list : [])
          .filter((item) => item && typeof item.id === "string" && item.id)
          .map((item) => ({
            id: item.id,
            name: typeof item.name === "string" && item.name ? item.name : item.id,
            connected: Boolean(item.connected),
            builtin: Boolean(item.builtin),
            local: Boolean(item.local),
          }))
        windows.set(windowId, clean)
        changed()
      }
    
      function forget(windowId) {
        if (!windows.delete(windowId)) return
        changed()
      }
    
      function servers() {
        const byId = new Map()
        for (const list of windows.values()) {
          for (const item of list) {
            const previous = byId.get(item.id)
            if (!previous) {
              byId.set(item.id, { ...item })
              continue
            }
            previous.connected = previous.connected || item.connected
            if (previous.name === previous.id && item.name !== item.id) previous.name = item.name
            previous.builtin = previous.builtin || item.builtin
            previous.local = previous.local || item.local
          }
        }
        return [...byId.values()].sort((left, right) => {
          if (left.builtin !== right.builtin) return left.builtin ? -1 : 1
          return left.name.localeCompare(right.name)
        })
      }
    
      function setHidden(ids) {
        const config = getConfig()
        const next = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id))]
        setConfig({ ...config, hiddenServers: next })
      }
    
      function setConfigServer(id) {
        const config = getConfig()
        setConfig({ ...config, configServer: id })
      }
    
      function signature() {
        return servers()
          .map((item) => `${item.id}:${item.name}:${item.connected ? 1 : 0}:${item.builtin ? 1 : 0}:${item.local ? 1 : 0}`)
          .join("|")
      }
    
      function changed() {
        const next = signature()
        if (next === lastSignature) return
        lastSignature = next
        onChange()
      }
    
      return { report, forget, servers, setHidden, setConfigServer }
    }
    
    module.exports = { createServerRegistry }
    
  },
  "core/native.js": function (module, exports, require) {
    "use strict"
    
    const { requestJson } = require("@b/core/http.js")
    
    async function issuePairing(endpoint) {
      if (!endpoint || !endpoint.url) throw new Error("OpenCode Desktop's server is not ready.")
      const result = await requestJson(endpoint, "/api/pair", "", { method: "POST", timeoutMs: 10000 })
      if (result.status < 200 || result.status >= 300 || !result.body || typeof result.body.code !== "string") {
        throw new Error("OpenCode Desktop could not create a pairing code.")
      }
      return {
        code: result.body.code,
        expiresIn: typeof result.body.expires_in === "number" ? result.body.expires_in : 300,
      }
    }
    
    async function redeemPairing(endpoint, code) {
      if (!endpoint || !endpoint.url) throw new Error("OpenCode Desktop's server is not ready.")
      const result = await requestJson(endpoint, `/auth/connect/${encodeURIComponent(code)}`, "", {
        headers: { accept: "application/json" },
        timeoutMs: 4000,
      })
      return result.status >= 200 && result.status < 300 && Boolean(result.body && typeof result.body.token === "string")
    }
    
    module.exports = { issuePairing, redeemPairing }
    
  },
  "core/config.js": function (module, exports, require) {
    "use strict"
    
    const os = require("node:os")
    const { parseUrl } = require("@b/core/util.js")
    
    const DEFAULT_PORT = 47821
    const DEFAULT_HOST = "127.0.0.1"
    
    const DEFAULT_CONFIG = {
      enabled: false,
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      publicUrl: "",
      hiddenServers: [],
      configServer: "sidecar",
      remoteEnabled: false,
      remoteRoute: "",
    }
    
    const ROUTE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
    
    function loopback(host) {
      return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
    }
    
    function normalizePublicUrl(value) {
      if (!value) return { value: "", basePath: "", error: undefined }
      const parsed = parseUrl(value.trim())
      if (!parsed || !/^https?:$/.test(parsed.protocol) || !parsed.hostname) {
        return { value: "", basePath: "", error: "Use an http(s) URL without credentials, query or fragment." }
      }
      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        return { value: "", basePath: "", error: "Use an http(s) URL without credentials, query or fragment." }
      }
      const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")
      if (path === "/api" || path.endsWith("/api")) {
        return { value: "", basePath: "", error: "A bridge path prefix must not end in /api; clients strip that suffix." }
      }
      return { value: `${parsed.origin}${path}`, basePath: path, error: undefined }
    }
    
    function normalizeConfig(input) {
      const config = { ...DEFAULT_CONFIG, ...(input || {}) }
      const host = String(config.host || DEFAULT_HOST).trim() || DEFAULT_HOST
      const port = Number(config.port)
      const publicUrl = normalizePublicUrl(String(config.publicUrl || ""))
      const hiddenServers = Array.isArray(config.hiddenServers)
        ? [...new Set(config.hiddenServers.filter((id) => typeof id === "string" && id))]
        : []
      const remoteRoute =
        typeof config.remoteRoute === "string" && config.remoteRoute.length <= 63 && ROUTE.test(config.remoteRoute)
          ? config.remoteRoute
          : ""
      return {
        value: {
          enabled: Boolean(config.enabled),
          host,
          port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT,
          publicUrl: publicUrl.value,
          hiddenServers,
          configServer: typeof config.configServer === "string" && config.configServer ? config.configServer : "sidecar",
          remoteEnabled: Boolean(config.remoteEnabled),
          remoteRoute,
        },
        basePath: publicUrl.basePath,
        error: publicUrl.error,
      }
    }
    
    function ipv4Addresses() {
      const entries = []
      const interfaces = os.networkInterfaces()
      for (const [name, aliases] of Object.entries(interfaces)) {
        for (const alias of aliases || []) {
          if (alias.family !== "IPv4" || alias.internal) continue
          entries.push({ name, address: alias.address })
        }
      }
      return entries
    }
    
    function addressHint(config) {
      if (config.publicUrl) return config.publicUrl
      if (!loopback(config.host)) {
        const first = ipv4Addresses()[0]
        if (first) return `http://${first.address}:${config.port}`
      }
      return `http://${config.host === "0.0.0.0" || config.host === "::" || config.host === "[::]" ? "127.0.0.1" : config.host}:${config.port}`
    }
    
    function reachableAddresses(config) {
      const values = []
      if (config.publicUrl) values.push(config.publicUrl)
      values.push(`http://127.0.0.1:${config.port}`)
      for (const entry of ipv4Addresses()) values.push(`http://${entry.address}:${config.port}`)
      return [...new Set(values)]
    }
    
    module.exports = {
      DEFAULT_CONFIG,
      DEFAULT_PORT,
      DEFAULT_HOST,
      loopback,
      normalizeConfig,
      normalizePublicUrl,
      ipv4Addresses,
      addressHint,
      reachableAddresses,
    }
    
  },
  "core/index.js": function (module, exports, require) {
    "use strict"
    
    const { createBridge } = require("@b/core/bridge.js")
    const { createCatalog, normalizeUrl, manualId } = require("@b/core/catalog.js")
    const { createControlPlane } = require("@b/core/control.js")
    const { createDeviceStore } = require("@b/core/devices.js")
    const { createServerRegistry } = require("@b/core/registry.js")
    const { issuePairing, redeemPairing } = require("@b/core/native.js")
    const { normalizeConfig, reachableAddresses, addressHint, ipv4Addresses } = require("@b/core/config.js")
    
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
    
  },
  "gui/main.js": function (module, exports, require) {
    "use strict"
    
    const { Schema } = require("effect")
    const { BridgeIpc, Config } = require("@b/gui/contract.js")
    const {
      createBridge,
      createCatalog,
      createControlPlane,
      createDeviceStore,
      createServerRegistry,
      issuePairing,
      redeemPairing,
      normalizeConfig,
      reachableAddresses,
      addressHint,
    } = require("@b/core/index.js")
    const { DEFAULT_CONFIG } = require("@b/core/config.js")
    const { requestJson } = require("@b/core/http.js")
    const { basicAuth, errorMessage, randomId } = require("@b/core/util.js")
    
    const VERSION = "0.2.2"
    const RPC_ID = "desktop-bridge.remote"
    const REMOTE_TIMEOUT = 180000
    
    const DeviceRecord = Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      hash: Schema.String,
      createdAt: Schema.Number,
      lastSeenAt: Schema.Number,
      expiresAt: Schema.Number,
    })
    
    const ManualServer = Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      url: Schema.String,
      password: Schema.String,
    })
    
    const Sources = Schema.Struct({
      tui: Schema.Array(ManualServer),
      web: Schema.Array(ManualServer),
    })
    
    const Admin = Schema.Struct({ token: Schema.String })
    
    function setup(ctx) {
      const configStore = ctx.storage.store("config", { schema: Config, initial: DEFAULT_CONFIG })
      const deviceStore = ctx.storage.store("devices", { schema: Schema.Array(DeviceRecord), initial: [] })
      const sourcesStore = ctx.storage.store("sources", { schema: Sources, initial: { tui: [], web: [] } })
      const adminStore = ctx.storage.store("admin", { schema: Admin, initial: { token: randomId("adm_", 32) } })
      const endpoints = ctx.serverEndpoints
    
      function writeLog(level, message, data) {
        try {
          ctx.log.write(level, `bridge: ${message}`, data)
        } catch {
          // Logging must never take the bridge down.
        }
      }
    
      const devices = createDeviceStore({
        load: () => deviceStore.value,
        save: (next) => deviceStore.set(next),
        log: writeLog,
      })
    
      function getConfig() {
        return normalizeConfig(configStore.value).value
      }
    
      function setConfig(next) {
        configStore.set(normalizeConfig(next).value)
      }
    
      let bridge
      let status = { state: "off", error: "", baseUrl: "", addresses: [], port: getConfig().port }
      let applying = Promise.resolve()
      let remote = { state: "off", url: "", error: "" }
      let remoteQueue = Promise.resolve()
    
      function queueRemote(run) {
        const next = remoteQueue.then(run, run)
        remoteQueue = next.catch(() => {})
        return next
      }
    
      async function remoteRpc(method, input = {}, timeoutMs = REMOTE_TIMEOUT) {
        const endpoint = endpoints && endpoints.get("sidecar")
        if (!endpoint) throw new Error("OpenCode Desktop's server is not ready yet.")
        const response = await requestJson(endpoint, `/api/rpc/${RPC_ID}/${method}`, "", {
          method: "POST",
          body: JSON.stringify({ input }),
          timeoutMs,
        })
        if (response.status < 200 || response.status >= 300) {
          const message =
            response.body && typeof response.body.message === "string"
              ? response.body.message
              : `Remote access request failed (${response.status}).`
          throw new Error(response.status === 404 ? "Remote access is not available. Restart OpenCode Desktop so the plugin server part loads." : message)
        }
        return (response.body && response.body.output) || {}
      }
    
      function remoteHost(config) {
        const host = String(config.host || "127.0.0.1")
        if (host === "0.0.0.0" || host === "::" || host === "[::]" || host === "::1" || host === "[::1]") return "127.0.0.1"
        if (host.includes(":") && !host.startsWith("[")) return `[${host}]`
        return host
      }
    
      let disposed = false
    
      // The sidecar can start after the plugin. Keep trying while the remote is
      // wanted, instead of leaving an already-paired phone offline until a refresh.
      function scheduleRemoteRetry() {
        if (disposed) return
        const timer = setTimeout(() => {
          const config = getConfig()
          if (!disposed && config.enabled && config.remoteEnabled && remote.state === "starting") void syncRemote()
        }, 3000)
        timer.unref?.()
      }
    
      function syncRemote() {
        return queueRemote(async () => {
          const config = getConfig()
          if (!config.enabled || !config.remoteEnabled) {
            if (remote.state !== "off") {
              remote = { state: "off", url: "", error: "" }
              try {
                await remoteRpc("detach", {}, 5000)
              } catch {
                // The server part may not be loaded yet; the route is local to it anyway.
              }
            }
            return remote
          }
          if (!bridge || !bridge.running) return remote
          remote = { state: "starting", url: "", error: "" }
          if (!endpoints || !endpoints.get("sidecar")) {
            scheduleRemoteRetry()
            return remote
          }
          try {
            const output = await remoteRpc("attach", {
              host: remoteHost(config),
              port: bridge.port,
              route: config.remoteRoute || "",
            })
            if (output.route && output.route !== getConfig().remoteRoute) {
              setConfig({ ...getConfig(), remoteRoute: output.route })
            }
            remote = { state: "on", url: String(output.url || ""), error: "" }
          } catch (error) {
            remote = { state: "error", url: "", error: errorMessage(error) }
            writeLog("warn", "remote access failed", { error: remote.error })
          }
          return remote
        })
      }
    
      function detachRemote() {
        return queueRemote(async () => {
          remote = { state: "off", url: "", error: "" }
          try {
            await remoteRpc("detach", {}, 5000)
          } catch {
            // Nothing to close when the server part is gone.
          }
          return remote
        })
      }
    
      async function makeQr(text) {
        try {
          const output = await remoteRpc("qr", { text }, 10000)
          return typeof output.svg === "string" ? output.svg : ""
        } catch (error) {
          writeLog("warn", "pairing QR unavailable", { error: errorMessage(error) })
          return ""
        }
      }
    
      const registry = createServerRegistry({
        getConfig,
        setConfig,
        onChange: () => bridge?.notifyChanged(),
      })
    
      function desktopEntries() {
        const entries = []
        for (const item of registry.servers()) {
          const endpoint = endpoints && endpoints.get(item.id)
          if (!endpoint || typeof endpoint.url !== "string") continue
          entries.push({
            id: item.id,
            name: item.name,
            url: endpoint.url,
            headers: endpoint.headers,
            connected: item.connected,
            builtin: item.builtin,
            local: item.local,
          })
        }
        return entries
      }
    
      function manualEntries(list) {
        return (Array.isArray(list) ? list : []).map((item) => ({
          id: item.id,
          name: item.name,
          url: item.url,
          headers: item.password ? { authorization: basicAuth(item.password) } : undefined,
          connected: true,
        }))
      }
    
      // Every configuration surface contributes here. Desktop is live; the TUI and
      // web sources are written through the admin control plane.
      const catalog = createCatalog({
        hidden: () => getConfig().hiddenServers,
        configServer: () => getConfig().configServer,
        log: writeLog,
        sources: [
          { id: "desktop", name: "OpenCode Desktop", entries: desktopEntries },
          { id: "tui", name: "TUI", entries: () => manualEntries(sourcesStore.value.tui) },
          { id: "web", name: "Web", entries: () => manualEntries(sourcesStore.value.web) },
        ],
      })
    
      function readSource(id) {
        const value = sourcesStore.value
        return Array.isArray(value[id]) ? value[id] : []
      }
    
      function writeSource(id, list) {
        sourcesStore.set({ ...sourcesStore.value, [id]: list })
      }
    
      function localBase(config) {
        const value = normalizeConfig(config).value
        return value.publicUrl || addressHint(value)
      }
    
      function baseFor(config) {
        const value = normalizeConfig(config).value
        return value.publicUrl || (remote.state === "on" && remote.url ? remote.url : addressHint(value))
      }
    
      async function pairing(mode = "local") {
        let config = getConfig()
        if (!config.enabled) {
          setConfig({ ...config, enabled: true })
          await schedule()
          config = getConfig()
        }
        if (!bridge || !bridge.running) throw new Error("The bridge is not running. Check the port in Advanced.")
    
        let base
        if (mode === "remote") {
          setConfig({ ...config, remoteEnabled: true })
          await syncRemote()
          if (remote.state !== "on" || !remote.url) {
            throw new Error(remote.error || "Internet access is not ready yet. Try again.")
          }
          base = remote.url
        } else {
          base = localBase(config)
        }
    
        const endpoint = endpoints && endpoints.get("sidecar")
        if (!endpoint) throw new Error("The Desktop server is not ready yet.")
        const result = await issuePairing(endpoint)
        const clean = String(base || "").replace(/\/+$/, "")
        if (!clean) throw new Error("The bridge has no reachable address.")
        const qr = await makeQr(JSON.stringify({ code: result.code, urls: [clean] }))
        return {
          link: `${clean}/auth/connect/${encodeURIComponent(result.code)}`,
          command: `opencode pair --url ${clean}`,
          code: result.code,
          urls: [clean],
          qr,
          base: clean,
          remote: mode === "remote",
          expiresAt: Date.now() + (result.expiresIn || 300) * 1000,
        }
      }
    
      const control = createControlPlane({
        adminToken: () => adminStore.value.token,
        readSource,
        writeSource,
        snapshot: () => catalog.snapshot(),
        baseUrl: () => baseFor(getConfig()),
        version: VERSION,
        pair: () => pairing(remote.state === "on" ? "remote" : "local"),
        log: writeLog,
        onChange: () => {
          bridge?.notifyChanged()
        },
      })
    
      async function apply() {
        const previous = bridge
        bridge = undefined
        if (previous) await previous.stop()
    
        const normalized = normalizeConfig(configStore.value)
        const config = normalized.value
        status = {
          state: "off",
          error: normalized.error || "",
          baseUrl: baseFor(config),
          addresses: reachableAddresses(config),
          port: config.port,
        }
        if (!config.enabled) {
          if (remote.state !== "off") void detachRemote()
          return
        }
        if (normalized.error) {
          status.state = "error"
          if (remote.state !== "off") void detachRemote()
          return
        }
    
        status.state = "starting"
        const instance = createBridge({
          resolveServer: (id) => catalog.resolve(id),
          servers: () => catalog.servers(),
          configServer: () => catalog.configServer(),
          redeem: async (code) => {
            const endpoint = endpoints && endpoints.get("sidecar")
            if (!endpoint) return false
            return redeemPairing(endpoint, code)
          },
          issuePairing: async () => {
            const endpoint = endpoints && endpoints.get("sidecar")
            if (!endpoint) throw new Error("The Desktop server is not ready yet.")
            return issuePairing(endpoint)
          },
          devices,
          control,
          appVersion: ctx.app.version,
          baseUrl: () => baseFor(getConfig()),
          log: writeLog,
        })
        bridge = instance
        try {
          const address = await instance.start({
            host: config.host,
            port: config.port,
            basePath: normalized.basePath,
          })
          status = {
            state: "running",
            error: "",
            baseUrl: baseFor(config),
            addresses: reachableAddresses(config),
            port: address.port,
          }
          if (config.remoteEnabled) void syncRemote()
          else if (remote.state !== "off") void detachRemote()
        } catch (error) {
          bridge = undefined
          status = {
            state: "error",
            error: errorMessage(error),
            baseUrl: baseFor(config),
            addresses: reachableAddresses(config),
            port: config.port,
          }
          if (remote.state !== "off") void detachRemote()
          writeLog("error", "could not listen", { error: errorMessage(error), host: config.host, port: config.port })
        }
      }
    
      function schedule() {
        applying = applying.then(apply, apply)
        return applying
      }
    
      const remoteTimer = setInterval(() => {
        const config = getConfig()
        if (disposed || !config.enabled || !config.remoteEnabled || remote.state !== "on") return
        void remoteRpc("status", {}, 5000).then(
          (output) => {
            if (disposed) return
            if (!output || output.state !== "on") void syncRemote()
          },
          () => {
            // The sidecar restarted and the server part lost its route.
            if (!disposed) void syncRemote()
          },
        )
      }, 10000)
      remoteTimer.unref?.()
    
      ctx.onCleanup(async () => {
        disposed = true
        clearInterval(remoteTimer)
        if (remote.state !== "off") {
          try {
            await remoteRpc("detach", {}, 1500)
          } catch {
            // The server part closes its own route when it unloads.
          }
          remote = { state: "off", url: "", error: "" }
        }
        const current = bridge
        bridge = undefined
        if (current) await current.stop()
      })
    
      if (ctx.windows && typeof ctx.windows.on === "function") {
        ctx.windows.on("close", (window) => registry.forget(window.id))
      }
    
      void schedule()
    
      function snapshot() {
        const config = getConfig()
        return {
          config,
          status: {
            state: status.state,
            error: status.error,
            baseUrl: baseFor(config),
            addresses: reachableAddresses(config),
            port: bridge ? bridge.port : status.port,
          },
          servers: catalog.snapshot(),
          devices: devices.list(),
          remote: { ...remote },
          sidecarReady: Boolean(endpoints && endpoints.get("sidecar")),
          adminToken: adminStore.value.token,
          bridgeVersion: VERSION,
          appVersion: ctx.app.version,
        }
      }
    
      function pair(mode = "local") {
        return pairing(mode === "remote" ? "remote" : "local")
      }
    
      ctx.provide(BridgeIpc, {
        snapshot: async () => snapshot(),
        reportServers: async (servers, caller) => {
          registry.report(caller && typeof caller.window === "number" ? caller.window : 0, servers)
        },
        setEnabled: async (enabled) => {
          setConfig({ ...getConfig(), enabled })
          await schedule()
          return snapshot()
        },
        setRemote: async (enabled) => {
          setConfig({ ...getConfig(), remoteEnabled: Boolean(enabled) })
          if (enabled) await syncRemote()
          else await detachRemote()
          return snapshot()
        },
        setNetwork: async (input) => {
          const normalized = normalizeConfig({ ...getConfig(), host: input.host, port: input.port, publicUrl: input.publicUrl })
          if (normalized.error) throw new Error(normalized.error)
          setConfig(normalized.value)
          await schedule()
          return snapshot()
        },
        setHidden: async (ids) => {
          registry.setHidden(ids)
          bridge?.notifyChanged()
          return snapshot()
        },
        setConfigServer: async (id) => {
          registry.setConfigServer(id)
          bridge?.notifyChanged()
          return snapshot()
        },
        revokeDevice: async (id) => {
          if (bridge) bridge.revokeDevice(id)
          else devices.revoke(id)
          return snapshot()
        },
        createDevice: async (name) => {
          const result = devices.create(String(name || "TUI"))
          return { token: result.token, id: result.device.id }
        },
        pair: async (input) => {
          const mode = typeof input === "string" ? input : input && input.mode
          return pair(mode === "remote" ? "remote" : "local")
        },
      })
    }
    
    module.exports = setup
    module.exports.setup = setup
    
  },
  "gui/index.js": function (module, exports, require) {
    "use strict"
    
    const { Plugin, Store } = require("@opencode/plugin/gui")
    const { Schema } = require("effect")
    const { setup } = require("@b/gui/renderer.js")
    const main = require("@b/gui/main.js")
    const en = require("@b/gui/strings.js")
    
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
    
  },
};
const __cache = Object.create(null);
function __require(id) {
  if (!id.startsWith("@b/")) return require(id);
  const key = id.slice(3);
  if (__cache[key]) return __cache[key].exports;
  const module = { exports: {} };
  __cache[key] = module;
  __modules[key].call(module.exports, module, module.exports, __require);
  return module.exports;
}
module.exports = __require("@b/gui/index.js");
