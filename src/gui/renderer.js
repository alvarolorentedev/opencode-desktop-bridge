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
