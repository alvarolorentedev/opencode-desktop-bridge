"use strict"

const { createComponent, createEffect, onCleanup } = require("solid-js")
const { SettingsPage, Command, Style } = require("@opencode/plugin/gui")
const { BridgeIpc } = require("./contract.js")
const { el, clear, relativeTime } = require("./dom.js")
const strings = require("./strings.js")
const css = require("./stylesheet.js")

function isLoopback(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]"
}

function setup(ctx) {
  if (!ctx.desktop) return
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
  const enable = el("input", { type: "checkbox" })
  const host = el("input", { class: "odb-input", value: "127.0.0.1", spellcheck: "false" })
  const port = el("input", { class: "odb-input", value: "47821", inputmode: "numeric" })
  const publicUrl = el("input", { class: "odb-input", placeholder: "https://…", spellcheck: "false" })
  const save = el("button", { class: "odb-button" }, t("save"))
  const warning = el("div", { class: "odb-warning" })
  warning.style.display = "none"
  const errorBox = el("div", { class: "odb-error" })
  const serversBox = el("div", { class: "odb-list" })
  const devicesBox = el("div", { class: "odb-list" })
  const pairBox = el("div", { class: "odb-card" })
  const diagBox = el("div", { class: "odb-list" })

  let snapshot
  let pairing

  function showError(error) {
    errorBox.textContent = error instanceof Error ? error.message : String(error || "")
  }

  function commandFor(base) {
    return `opencode pair --url ${base}`
  }

  function copy(value, button) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return
    void navigator.clipboard.writeText(value).then(() => {
      const previous = button.textContent
      button.textContent = t("copied")
      setTimeout(() => (button.textContent = previous), 1200)
    })
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
        const hidden = new Set(snap.config.hiddenServers)
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
        el("span", { class: "odb-muted" }, server.id === "sidecar" ? "desktop" : server.connected ? "" : "offline"),
      ])
      const actions = el("div", { class: "odb-actions" }, [])
      if (server.configServer) {
        actions.append(el("span", { class: "odb-tag" }, t("configServer")))
      } else if (server.exposed) {
        const use = el("button", { class: "odb-button" }, t("useForConfig"))
        use.onclick = async () => {
          try {
            snapshot = await ipc.setConfigServer(server.id)
            apply(snapshot)
          } catch (error) {
            showError(error)
          }
        }
        actions.append(use)
      }
      serversBox.append(el("div", { class: "odb-row" }, [label, actions]))
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

  function renderPairing(snap) {
    clear(pairBox)
    const base = snap.status.baseUrl || snap.status.addresses[0] || ""
    const hint = el("div", { class: "odb-muted" }, t("pairingHint"))
    if (pairing) {
      const link = el("div", { class: "odb-code" }, pairing.link)
      const command = el("div", { class: "odb-code" }, pairing.command)
      const copyLink = el("button", { class: "odb-button" }, t("copy"))
      copyLink.onclick = () => copy(pairing.link, copyLink)
      const copyCommand = el("button", { class: "odb-button" }, t("copy"))
      copyCommand.onclick = () => copy(pairing.command, copyCommand)
      const expires = el("div", { class: "odb-muted" }, `Expires ${new Date(pairing.expiresAt).toLocaleTimeString()}`)
      pairBox.append(link, el("div", { class: "odb-actions" }, [copyLink]), command, el("div", { class: "odb-actions" }, [copyCommand]), expires, hint)
      return
    }
    const pair = el("button", { class: "odb-button" }, t("pair"))
    pair.onclick = async () => {
      try {
        pairing = await ipc.pair()
        renderPairing(snapshot)
      } catch (error) {
        showError(error)
      }
    }
    const manual = el("div", { class: "odb-code" }, commandFor(base))
    const copyCommand = el("button", { class: "odb-button" }, t("copy"))
    copyCommand.onclick = () => copy(commandFor(base), copyCommand)
    pairBox.append(pair, el("div", { class: "odb-actions" }, [copyCommand]), manual, hint)
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
    line(t("addresses"), snap.status.addresses.join("  ·  ") || "—")
    line(t("version"), `bridge ${snap.bridgeVersion} · desktop ${snap.appVersion}`)
    line(t("desktopServer"), snap.sidecarReady ? t("ready") : t("notReady"))
  }

  function apply(snap) {
    snapshot = snap
    const state = snap.status.state
    statusText.textContent =
      state === "running"
        ? `${t("running")} · ${snap.status.baseUrl}`
        : state === "starting"
          ? t("starting")
          : state === "error"
            ? `${t("failed")} · ${snap.status.error}`
            : t("stopped")
    enable.checked = snap.config.enabled
    if (document.activeElement !== host) host.value = snap.config.host
    if (document.activeElement !== port) port.value = String(snap.config.port)
    if (document.activeElement !== publicUrl) publicUrl.value = snap.config.publicUrl
    warning.textContent = t("loopbackWarning")
    let baseHost = ""
    try {
      baseHost = new URL(snap.status.baseUrl || "http://127.0.0.1").hostname
    } catch {
      baseHost = ""
    }
    warning.style.display = !snap.config.publicUrl && isLoopback(baseHost) ? "block" : "none"
    renderServers(snap)
    renderDevices(snap)
    if (pairing && pairing.expiresAt < Date.now()) pairing = undefined
    renderPairing(snap)
    renderDiagnostics(snap)
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

  enable.onchange = async () => {
    try {
      pairing = undefined
      apply(await ipc.setEnabled(enable.checked))
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

  const root = el("div", { class: "odb" }, [
    warning,
    section(t("status"), [
      row(t("status"), statusText, el("label", { class: "odb-item" }, [enable, el("span", {}, t("enabled"))])),
    ]),
    section(t("network"), [
      row(t("host"), t("hostHint"), host),
      row(t("port"), t("portHint"), port),
      row(t("publicUrl"), t("publicUrlHint"), publicUrl),
      row(null, null, el("div", { class: "odb-actions" }, [save])),
    ]),
    section(t("servers"), [row(t("servers"), t("serversHint"), serversBox)]),
    section(t("pairing"), [row(t("pairing"), t("pairingHint"), pairBox)]),
    section(t("devices"), [row(t("devices"), null, devicesBox)]),
    section(t("diagnostics"), [row(t("diagnostics"), null, diagBox)]),
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

module.exports = { setup, renderPage }
