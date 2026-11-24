# Architecture

```text
Configuration:
  Desktop window ──ctx.servers──┐
  TUI /bridge ────admin API─────┤──► catalog ──► bridge
  Web settings ───admin API─────┘

OpenCode Mobile / any v2 client
        │ one OpenCode v2 server: /api/*, SSE, WebSockets
        ▼
opencode-desktop-bridge (OpenCode Desktop GUI plugin, main process)
  ├─ synthetic     /api/info, /api/health, /api/event, /auth/connect/:code
  ├─ control       /bridge/v1/admin/* (admin token, loopback Host only)
  ├─ aggregate     projects, sessions, pending permissions/forms, PTYs
  ├─ route         session ID · PTY ID · directory · project ID
  └─ config server /api/config, /api/model, /api/agent, … 
        │ catalog.resolve(id): URL + headers
        ├────────────► Desktop sidecar (default configuration server)
        ├────────────► remote OpenCode server A
        ├────────────► remote OpenCode server B
        └────────────► TUI / web manual servers

Phone ──https──► <route>.<tunnel-hostname> ──► OpenTunnel
                                              │
                    OpenCode server plugin ───┘
                    (server part, owns the route)
                              │ forwards to
                              ▼
                    bridge listener 127.0.0.1:<port>
```

The internet route is claimed by the plugin's **server part**, not by the Desktop main process. The server part is loaded by the OpenCode server that loads the plugin, so it has the plugin's `@opentunnel/client` dependency and the same device tunnel as `opencode pair --remote`. Desktop main asks it to attach/detach over a local plugin RPC (`/api/rpc/desktop-bridge.remote/*`) and receives the public bridge URL.

The bridge is a **virtual OpenCode server**: one API surface, one device token, one normal mobile profile per paired address. It is not a new execution engine and does not copy conversations. Every session, message, permission and terminal belongs to one real upstream server, which remains the source of truth.

## Runtime

- The GUI plugin’s **main entry** runs in Electron’s main process with Node built-ins. It hosts the HTTP listener, the admin control plane, WebSocket tunnels and the pairing UI itself; there is no companion daemon.
- The GUI plugin’s **window entry** contributes the Desktop settings page and reports the Desktop server list to main through the plugin Ipc.
- The **web window** runs the same `setup` with `ctx.desktop` false. It contributes the web settings page and does not report a server list.
- The **server part** runs in the local OpenCode server. It registers the `desktop-bridge.remote` RPC, owns the OpenTunnel connection and generates pairing QR SVGs.
- The **TUI part** contributes the `/bridge` command. It writes the `tui` source through the admin control plane.
- Main reads Desktop URLs and credentials from `ctx.serverEndpoints.get(id)` at request time. Desktop credentials never leave the main process. TUI and web credentials are sent over the admin API and stored in plugin storage; a TLS terminator in front sees them. The mobile client never receives upstream credentials.
- The listener starts only when **Share servers** is enabled. `ctx.onCleanup` closes it; changing host, port or public URL restarts it. If a remote route was wanted, main re-attaches it after the listener restarts.

## Sources and catalog

The bridge exposes one server list built by `src/core/catalog.js` from three sources:

- **desktop**: the live list reported by Desktop windows, resolved through `ctx.serverEndpoints`.
- **tui**: a manual list stored in the plugin's storage, written by the TUI `/bridge` command.
- **web**: a manual list stored in the plugin's storage, written by the web app's Desktop Bridge settings page.

Entries are deduplicated by normalized URL, with Desktop first. The hidden list and the configuration-server selection apply to IDs from every source.

`src/core/control.js` is the admin control plane on the bridge listener. It accepts `GET /bridge/v1/admin/status`, `/servers`, `/sources/:source`, `PUT|POST /bridge/v1/admin/servers/:source`, `DELETE /bridge/v1/admin/servers/:source/:id`, and `POST /bridge/v1/admin/pair`. Every route requires the bridge admin token; the route handles CORS for the web settings page. It never carries conversation data and never exposes upstream passwords. `bridge.js` refuses admin requests whose `Host` is not loopback, so the tunnel cannot reach the control plane.

The data plane is unchanged: it still requires a bridge device token. The control plane only changes which servers the catalog exposes.

## Server discovery

```text
Desktop window                     plugin main
ctx.servers.list()/get()  ──Ipc──► registry.report(window, [{id,name,connected,builtin,local}])
                                   │
                                   ├─ union across open windows
                                   └─ catalog: Desktop + TUI + web, dedupe, hidden, config server
                                      └─ serverEndpoints.get(id) per request
```

`ctx.servers` is the only API that lists the servers Desktop knows. Main has no list API, only `get(id)`, so the window reports snapshots. The union of open windows is the registry; closing a window drops its contribution. Servers that disappear from an open window’s list are removed; a desktop with no windows makes non-sidecar servers unavailable rather than removed.

## Pairing

The bridge is not a pairing issuer.

```text
Settings › Pair over the internet
        │
        ├─ main → server part RPC attach(route, target)
        │            server part → OpenTunnel connect (same default device tunnel as Remote access)
        │            server part returns https://<route>.<tunnel-hostname>
        │
        └─ main → Desktop sidecar: POST /api/pair → 5-minute, single-use code
                     │
phone scans QR                           │
        │                                │
        ▼                                │
GET <bridge-route>/auth/connect/<code> ──┘
        │
        ├─ bridge → Desktop sidecar: GET /auth/connect/<code> (Accept: application/json)
        │            sidecar consumes the code, returns a native token
        ├─ bridge discards the native token
        └─ bridge issues brg1_… device token (SHA-256 stored, 30-day expiry)
```

**Pair on this network** skips the tunnel step and uses the configured bind address (or `publicUrl`). Both modes issue the same native code and the same bridge device token; a phone may pair once per address. The QR payload is the native `{ code, urls }` shape, so no mobile changes are needed.

Using the sidecar code as proof means the native pairing service remains the authority, while the phone receives a credential scoped to the bridge. Revoking a device is bridge-local and immediate. If the local server restarts, the server part loses the OpenTunnel route; main's 10-second status check re-attaches it and the phone reconnects.

## Routing

| Pattern | Behaviour |
|---|---|
| `GET /auth/connect/:code` | Redeem a code issued by Desktop’s own pairing service; issue a bridge device token. |
| `POST /api/pair` | Relay to Desktop’s pairing service for authenticated clients; the bridge never mints codes. |
| `GET /api/info`, `/api/health` | Synthetic. Upstream `pid`, `hostname`, `urls` and temp paths are removed. |
| `GET /api/event` | One upstream event stream per exposed server per client, merged and forwarded byte-for-byte. |
| `GET /api/project` | Aggregate, dedupe by worktree (configuration server first). |
| `/api/project/:projectID/**` | Route by project index; unknown → configuration server. |
| `GET /api/session` (no directory) | Aggregate pages; a synthetic cursor carries each server’s cursor. |
| `GET /api/session?…directory` | Route to the directory owner. |
| `/api/session/:sessionID/**` | Route by session index; unknown IDs are discovered with a bounded fan-out. |
| `POST /api/session` | Read `location.directory`; route to that server; index the result. |
| `GET /api/session/active` | Merge maps. |
| `GET /api/permission/request`, `/api/form` | Merge `{data}` arrays; replies already carry `sessionID`, so they route by session. |
| `GET/POST /api/pty…` | By directory; `GET /api/pty` without one aggregates. |
| `/api/pty/:id/**`, persistent PTY, upgrades | Route by PTY index; unknown → configuration server. |
| `/api/location`, `/api/fs/*`, `/api/vcs/*`, `/api/worktree*` | By directory or project ID. |
| `/api/config`, `/api/model`, `/api/agent`, `/api/command`, `/api/skill`, `/api/mcp`, `/api/provider`, `/api/integration`, `/api/credential`, `/api/experimental/*` | Configuration server. |
| other `/api/*` | Configuration server, or the directory owner when the request carries a directory. |
| non-`/api/*` | 404. |

The **configuration server** is selected in the settings page and defaults to the desktop sidecar. It supplies global catalogs and is used whenever a directory or project cannot be attributed to exactly one server.

## Indexes

The bridge keeps only routing indexes, never content:

- `sessionID → server`
- `ptyID → server`
- `projectID → server`
- `directory → set(server)` (unique owner or ambiguous)
- `savedPermissionID → server`

They are learned from list responses, create responses and events. Removing a server drops its entries. A bridge restart leaves them empty; lists repopulate them, and a direct session request can discover its owner.

## Events and synchronization

- Each streaming client gets one upstream `/api/event` per exposed server. Upstream frames are parsed only for routing hints, then forwarded unchanged.
- A removed server closes its upstream and the bridge sends a synthetic `server.connected`, which makes mobile invalidate and refetch. An added server opens a stream and does the same.
- Upstream streams reconnect with exponential backoff. One failed server never closes the merged stream.
- A slow client is disconnected (`writableLength` cap); mobile reconnects and refetches. The bridge never buffers conversation events.
- Conversation state, running status, permissions and questions are synchronized by the upstream server, not by the bridge. Desktop and mobile see the same events because they read the same session.

## Failure isolation

- A dead upstream returns an empty contribution to aggregated lists; the rest still work.
- A completely unreachable set returns `502` with a generic message, never an upstream URL.
- A removed target returns `404` for its sessions and disappears from lists.
- The bridge binds one port. If the port is in use it reports an error and stays off rather than silently changing ports, so saved mobile profiles keep working.
- Internet pairing failing never stops local pairing. The platform route is separate from the listener; a failed attach leaves the local listener and existing LAN profiles intact.
- If the sidecar or its server part restarts, the tunnel route is lost. Main probes the remote status every 10 seconds and re-attaches while internet access is wanted.

## Repository layout

```text
src/core/       Node-only: routing, catalog, control plane, HTTP/WS proxy, merge, SSE, devices, bridge server
src/core/remote.mjs  OpenTunnel controller (server part only; no Electron dependency)
src/gui/        Plugin.define, main entry, desktop settings page, web settings page, Ipc contract
src/server.mjs       Server plugin entry: registers the remote RPC and owns the tunnel
src/server-rpc.mjs   RPC definition, handlers and QR encoder
src/tui.ts      TUI `/bridge` control surface
scripts/        dependency-free CommonJS bundle builder
test/           unit, catalog, control, HTTP aggregates/routing, SSE, WebSocket, web/desktop UI, remote tunnel, bundle, plugin-main
```

`src/core` is built and tested without Electron. `scripts/build.mjs` inlines the modules into one `dist/gui-experimental.cjs` because the desktop host evaluates a single CommonJS bundle with its own `require` of provided modules. The TUI part is loaded directly by the TUI from the package's `./tui` export; the server part is loaded by the OpenCode server from `./server`.
