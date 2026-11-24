import { Plugin } from "@opencode/plugin/tui"

const DEFAULT_URL = "http://127.0.0.1:47821"
const SOURCE = "tui"

type Settings = { url: string; token: string }

async function request(settings: Settings, path: string, options: any = {}) {
  const base = String(settings.url || DEFAULT_URL).replace(/\/+$/, "")
  if (!settings.token) throw new Error("Set the bridge admin token first.")
  const headers: Record<string, string> = { ...(options.headers || {}), authorization: `Bearer ${settings.token}` }
  if (options.body !== undefined) headers["content-type"] = "application/json"
  const response = await fetch(`${base}/bridge/v1/admin${path}`, { ...options, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body && body.message ? body.message : `Request failed (${response.status})`)
  return body
}

async function configure(context: any, settings: Settings, update: any) {
  const url = await context.ui.dialog.prompt({
    title: "Bridge URL",
    value: settings.url || DEFAULT_URL,
    placeholder: DEFAULT_URL,
  })
  if (url === undefined) return false
  const token = await context.ui.dialog.prompt({
    title: "Admin token",
    placeholder: settings.token ? "keep current token" : "from Desktop Bridge settings",
  })
  if (token === undefined) return false
  await update((draft: Settings) => {
    draft.url = (url || settings.url || DEFAULT_URL).trim()
    draft.token = (token || settings.token).trim()
  })
  if (!settings.token) {
    context.ui.toast.show({ message: "Add the bridge admin token to continue.", variant: "error" })
    return false
  }
  return true
}

async function add(context: any, settings: Settings) {
  const name = await context.ui.dialog.prompt({ title: "Server name", placeholder: "Build machine" })
  if (name === undefined) return
  const url = await context.ui.dialog.prompt({ title: "Server URL", placeholder: "http://192.168.1.20:4096" })
  if (url === undefined) return
  const password = await context.ui.dialog.prompt({ title: "Password (optional)", placeholder: "leave empty for none" })
  if (password === undefined) return
  await request(settings, `/servers/${SOURCE}`, {
    method: "POST",
    body: JSON.stringify({ name, url, password }),
  })
  context.ui.toast.show({ message: `Added ${name || url}`, variant: "success" })
}

async function remove(context: any, settings: Settings) {
  const result = await request(settings, `/sources/${SOURCE}`)
  const servers = Array.isArray(result.data) ? result.data : []
  if (!servers.length) {
    await context.ui.dialog.alert({ title: "No TUI servers", message: "Add a server from the Desktop Bridge menu first." })
    return
  }
  const id = await context.ui.dialog.select({
    title: "Remove server",
    options: servers.map((server: any) => ({
      title: server.name,
      value: server.id,
      description: server.url,
    })),
  })
  if (id === undefined) return
  await request(settings, `/servers/${SOURCE}/${encodeURIComponent(id)}`, { method: "DELETE" })
  context.ui.toast.show({ message: "Server removed", variant: "success" })
}

async function status(context: any, settings: Settings) {
  const result = await request(settings, "/status")
  const sources = (result.sources || []).map((source: any) => `${source.name}: ${source.count}`).join(" · ")
  await context.ui.dialog.alert({
    title: "Desktop Bridge",
    message: `${result.baseUrl || settings.url}\n${sources}`,
  })
}

async function pair(context: any, settings: Settings) {
  const result = await request(settings, "/pair", { method: "POST" })
  await context.ui.dialog.alert({
    title: "Pair a device",
    message: `${result.link}\n\nExpires ${new Date(result.expiresAt).toLocaleTimeString()}`,
  })
}

async function menu(context: any, settings: Settings, update: any) {
  try {
    if (!settings.token && !(await configure(context, settings, update))) return
    const choice = await context.ui.dialog.select({
      title: "Desktop Bridge",
      options: [
        { title: "Add server", value: "add", description: "Write a server into the TUI source" },
        { title: "Remove server", value: "remove", description: "Remove a server from the TUI source" },
        { title: "Pair a device", value: "pair", description: "Create a one-time link for mobile" },
        { title: "Show status", value: "status", description: "Sources and bridge address" },
        { title: "Configure", value: "configure", description: "Bridge URL and admin token" },
      ],
    })
    if (choice === undefined) return
    if (choice === "add") return await add(context, settings)
    if (choice === "remove") return await remove(context, settings)
    if (choice === "pair") return await pair(context, settings)
    if (choice === "status") return await status(context, settings)
    if (choice === "configure") return void (await configure(context, settings, update))
  } catch (error) {
    context.ui.toast.show({
      message: error instanceof Error ? error.message : String(error),
      variant: "error",
      duration: 8000,
    })
  }
}

export default Plugin.define({
  id: "opencode-desktop-bridge.tui",
  setup(context: any) {
    const [settings, update] = context.storage.store("bridge", {
      initial: { url: DEFAULT_URL, token: "" },
    })
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "opencode-desktop-bridge.servers",
          title: "Desktop Bridge servers",
          group: "Desktop Bridge",
          slash: { name: "bridge" },
          run: () => menu(context, settings, update),
        },
      ],
    }))
  },
})
