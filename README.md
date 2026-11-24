# opencode-desktop-bridge

One OpenCode server on your phone for **every server configured in OpenCode Desktop**.

The plugin runs inside Desktop, exposes a single OpenCode v2 API, and combines the servers Desktop already knows about. Pair with the existing `opencode pair` flow, point OpenCode Mobile at the bridge, and use existing projects, sessions and terminals without configuring each server on the phone.

- One pairing. One connection profile. No mobile changes.
- Desktop stays the source of truth; the bridge stores no conversations.
- Apache-2.0, no hosted service, no subscription.

## Requirements

- OpenCode Desktop 2.x with the GUI plugin API (`gui-experimental`).
- Node.js 18+ to build the bundle.
- OpenCode Mobile (or any OpenCode v2 client) for the phone.
- Optional: Tailscale, WireGuard, or an authenticated HTTPS tunnel for remote access.

## Install

```bash
opencode plugin add opencode-desktop-bridge
```

Restart OpenCode Desktop, then open **Settings › Desktop Bridge** and turn it on. The plugin is a GUI-only package: it adds no server-side code and never modifies Desktop.

To build from source:

```bash
node scripts/build.mjs
```

Then add the package with your usual OpenCode plugin configuration (or `opencode plugin add` once published).

## Pair a phone

The bridge uses the **native pairing issuer**. It never mints its own pairing codes.

1. In Desktop, open **Settings › Desktop Bridge** and choose a reachable bind address or public URL. The default is `127.0.0.1`, which only works on this computer.
2. Either run:

   ```bash
   opencode pair --url http://<desktop-ip>:47821
   ```

   or press **Create pairing link** in the settings page.

3. Scan the QR with OpenCode Mobile (the `opencode pair` command prints one) or open the link. The code expires in 5 minutes and works once.
4. The phone receives a bridge device token, not an upstream token, and stores it as a normal connection password.

The code is issued by Desktop's own background service. The bridge redeems it against that same service and issues its own device token. If the command and Desktop use different service instances (for example different CLI channels), redemption fails with a clear message; use the settings-page link instead.

If the bridge is mounted under a path prefix (for example `https://host/bridge`), use the QR or the settings-page link. The `opencode pair` **printed link** drops path prefixes because the CLI builds it from an absolute `/auth/connect/…` path.

## What the phone sees

One normal OpenCode v2 server:

- projects and sessions from every exposed Desktop server, merged;
- messages, prompts, streaming, permissions, questions, todos and diffs, routed to the owning server;
- terminals and WebSockets, tunneled to the owning server;
- files, VCS and worktrees for the project on screen;
- models, agents, commands and MCP configuration from the **configuration server** (Desktop’s own server by default).

Sessions keep their real IDs. Server identity does not leak: the phone never receives upstream URLs or credentials.

Leave the bridge profile’s **working directory** empty. The pairing flow does; a non-empty directory scopes the shared project and session lists to that one project.

## Add and remove servers

Every server Desktop lists (local, remote, SSH/WSL contributions) appears in the settings page.

- **Exposed** servers are visible to every paired device. New servers are exposed by default.
- **Hidden** servers are ignored by the bridge; the phone cannot see they exist.
- Hide a newly added server if the phone should not see it. No re-pairing is needed either way.
- Removing a server makes its projects and sessions disappear from the phone; an open chat on it reports that the session is no longer available.
- Re-adding the same URL restores it.

## Security

- Binds `127.0.0.1` by default. Remote binding is an explicit choice.
- Every request and WebSocket requires a device token.
- The bridge never sends upstream credentials to a client, and never logs tokens, pairing codes, prompts or source code.
- Pairing codes are 5-minute, single-use and rate-limited.
- Devices are revocable immediately; revocation closes their streams and sockets.
- One token currently grants every **exposed** server, including its terminal. Expose only machines you trust the phone with.
- Prefer Tailscale or a private network. HTTPS terminates in front of the bridge (Tailscale Serve, a reverse proxy, or a tunnel); the bridge itself is plain HTTP.

See [docs/security.md](docs/security.md) for the threat model.

## Known limits

The single-server view is an aggregation, not a new OpenCode engine.

- **Global configuration comes from one server** (Desktop’s own by default). A session on another server may use a model or agent that the selected configuration server does not list. Existing sessions keep working with their current model; changing models or creating a session with an unsupported model can fail.
- **Duplicate project paths** on two machines collapse into one project. New sessions and file operations for that path go to the configuration server.
- **Removing a server looks like deletion**, not like “server offline”. The app has no per-server health state in this mode.
- Sessions from different machines are distinguished only by their project path.
- Upstream servers must speak the v2 API. v1 servers, OIDC-protected servers, and connections that rely on custom gateway headers or per-server certificates cannot be exposed.
- The bridge runs only while Desktop is running. Non-sidecar servers become known through a Desktop window.
- Future API routes not handled explicitly are forwarded to the configuration server, or to the directory owner when the request carries a directory.

See [docs/architecture.md](docs/architecture.md) and [docs/limits.md](docs/limits.md).

## Development

```bash
node scripts/build.mjs   # dist/gui-experimental.cjs
node --test test/        # core, HTTP, SSE, WebSocket, bundle and plugin-main tests
```

The core has no Electron dependency: it takes server resolution, device storage and native pairing as injected functions, so the proxy and aggregation are tested against real HTTP/SSE/TCP servers. See [docs/architecture.md](docs/architecture.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
