# Architecture

```text
OpenCode Mobile / any v2 client
        │ one OpenCode v2 server: /api/*, SSE, WebSockets
        ▼
opencode-desktop-bridge (OpenCode Desktop GUI plugin, main process)
  ├─ synthetic     /api/info, /api/health, /api/event, /auth/connect/:code
  ├─ aggregate     projects, sessions, pending permissions/forms, PTYs
  ├─ route         session ID · PTY ID · directory · project ID
  └─ config server /api/config, /api/model, /api/agent, … 
        │ serverEndpoints.get(id): URL + existing credentials
        ├────────────► Desktop sidecar (default configuration server)
        ├────────────► remote OpenCode server A
        └────────────► remote OpenCode server B
```

The bridge is a **virtual OpenCode server**: one API surface, one device token, one mobile profile. It is not a new execution engine and does not copy conversations. Every session, message, permission and terminal belongs to one real upstream server, which remains the source of truth.

## Runtime

- The GUI plugin’s **main entry** runs in Electron’s main process with Node built-ins. It hosts the HTTP listener and WebSocket tunnels itself; there is no companion daemon.
- The GUI plugin’s **window entry** does two things: contributes the settings page, and reports the desktop server list to main through the plugin Ipc.
- Main reads each server’s URL and credentials from `ctx.serverEndpoints.get(id)` at request time. Credentials never enter the window, the mobile client, or the plugin storage.
- The listener starts only when the user enables the bridge. `ctx.onCleanup` closes it; changing host, port or public URL restarts it.

## Server discovery

```text
Desktop window                     plugin main
ctx.servers.list()/get()  ──Ipc──► registry.report(window, [{id,name,connected,builtin,local}])
                                   │
                                   ├─ union across open windows
                                   ├─ apply hidden list
                                   └─ serverEndpoints.get(id) per request
```

`ctx.servers` is the only API that lists the servers Desktop knows. Main has no list API, only `get(id)`, so the window reports snapshots. The union of open windows is the registry; closing a window drops its contribution. Servers that disappear from an open window’s list are removed; a desktop with no windows makes non-sidecar servers unavailable rather than removed.

## Pairing

The bridge is not a pairing issuer.

```text
opencode pair --url <bridge>          Settings › Create pairing link
       │                                       │
       └──────────► Desktop background service ─┘
                    POST /api/pair → 5-minute, single-use code
                                   │
phone scans link / QR              │
       │                           │
       ▼                           │
GET <bridge>/auth/connect/<code> ──┘
       │
       ├─ bridge → Desktop sidecar: GET /auth/connect/<code> (Accept: application/json)
       │            sidecar consumes the code, returns a native token
       ├─ bridge discards the native token
       └─ bridge issues brg1_… device token (SHA-256 stored, 30-day expiry)
```

Using the sidecar code as proof means the native pairing service remains the authority, while the phone receives a credential scoped to the bridge. Revoking a device is bridge-local and immediate.

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

## Repository layout

```text
src/core/       Node-only: routing, HTTP/WS proxy, merge, SSE, devices, bridge server
src/gui/        Plugin.define, main entry, settings page, Ipc contract
scripts/        dependency-free CommonJS bundle builder
test/           unit, HTTP aggregates/routing, SSE, WebSocket, bundle, plugin-main
```

`src/core` is built and tested without Electron. `scripts/build.mjs` inlines the modules into one `dist/gui-experimental.cjs` because the desktop host evaluates a single CommonJS bundle with its own `require` of provided modules.
