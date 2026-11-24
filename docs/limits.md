# Limits of the single-server view

The bridge presents one OpenCode v2 server so an unmodified client can use every Desktop server. These limits are the cost of that view.

## Global configuration

`/api/config`, `/api/model`, `/api/agent`, `/api/command`, `/api/skill`, `/api/mcp`, `/api/provider` and related catalogs come from the **configuration server** selected in settings (Desktop’s own server by default).

- Existing sessions keep their own model and agent from their server.
- Changing a model or agent to one the session’s server does not have fails on that server.
- Creating a session on a remote project uses the globally selected model/agent; if that server lacks it, creation fails.
- The app shows one model list, not one per server.

Configure the same providers/models on the machines you expose if you switch models often.

## Duplicate project paths

Projects are deduplicated by worktree path. If two servers have `/work/app`, the phone shows one project and sends new-session/file/VCS operations to the configuration server. Sessions from both servers still appear and open by ID.

## Server removal

Removing a server from Desktop removes its projects and sessions from aggregated lists. An open chat reports that the session is no longer available. The phone cannot distinguish this from deletion, and there is no per-server “offline” badge in this mode.

## Server identity

All sessions show the bridge as their server. They are distinguished by project path. Two machines using the same path are indistinguishable without opening a session.

## Working directory on the bridge profile

Keep the bridge connection’s `directory` empty. The pairing flow does. A non-empty working directory is sent as a scope on `/api/session`, so the phone sees only that project instead of every server’s projects.

## Routed-by-default behavior

Some endpoints are not part of the core session surface (for example experimental APIs and provider OAuth callbacks). They go to the configuration server, unless they carry a `directory` or `location[directory]` query, in which case they go to that directory’s server. If a feature exists only on another server, it is not reachable through that route.

## Sources

- Desktop is the live source. TUI and web entries are stored in the bridge and survive restarts.
- Duplicate URLs collapse to one target; Desktop wins over TUI and web entries.
- TUI and web entries have no health check. An offline server fails per request and stays in the list.
- The TUI `/bridge` command only edits the bridge. The TUI must still connect with `--server` to see the merged view.
- The web app's server list is browser-local. Syncing writes a copy into the bridge; it does not make the browser's list shared by itself. The bridge uses the URLs as the browser sees them, so make sure they are reachable from the Desktop host (`localhost` means the browser's machine). A copied credential that expires must be re-synced.
- TUI and web clients send upstream passwords to the bridge. The admin token is a bearer credential. Use a loopback bridge or HTTPS.

## Protocols

- Upstream servers must speak OpenCode v2. v1 servers cannot be exposed.
- TUI and web manual sources authenticate with HTTP Basic (`opencode:<password>`). Servers that require OIDC, custom headers or client certificates must be configured in Desktop instead.
- Upstream servers using OIDC cannot be exposed: plugin main receives Basic/sidecar credentials only. The same applies to custom gateway headers and per-server certificates configured in Desktop’s connection form.
- Upstream HTTPS certificates must be trusted by the desktop process. Desktop’s per-server certificate overrides are not available to plugin main.

## Pairing

- `opencode pair` must use `--url <bridge>`; without it, the CLI prints the sidecar’s own addresses.
- The CLI’s **printed link** drops a bridge path prefix; its **QR** and the settings-page link keep it.
- The CLI and Desktop must use the same background service instance (same channel/version). The settings-page pairing uses Desktop’s own server directly and is the reliable path.
- `opencode pair --url` is not supported for a bridge in front of a **different** machine; it always issues the code on the local service.

## Runtime

- Browser clients: the data plane does not enable CORS and browser WebSockets cannot attach the device token header. Native clients (including OpenCode Mobile) work; the mobile web build and arbitrary browser pages do not. The web app's Desktop Bridge settings page only calls the admin control API, which does allow CORS.
- The bridge runs only while Desktop runs. If every Desktop window is closed, only the sidecar is known first-hand; other servers become unavailable until a window reports them again.
- The listener uses one fixed port. If the port is taken, the bridge reports an error instead of moving, because mobile profiles store the URL.
- TLS is terminated outside the bridge.
- WebSocket tunnels authenticate before dialing and are closed on device revocation.

## Future API drift

Unknown `/api/*` routes are forwarded to the configuration server. A new session-scoped endpoint that the bridge does not classify may therefore target the wrong server. Pin the plugin to a tested Desktop version and add a routing rule when adopting a new API area.
