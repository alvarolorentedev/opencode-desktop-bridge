# opencode-desktop-bridge

One OpenCode server on your phone for **every server configured in OpenCode Desktop, the TUI or the web**.

The plugin runs inside Desktop, exposes a single OpenCode v2 API, and combines the servers Desktop already knows about. Pair with the existing `opencode pair` flow, point OpenCode Mobile at the bridge, and use existing projects, sessions and terminals without configuring each server on the phone.

The same server list can also be configured from the TUI (`/bridge`) or from the web app's Desktop Bridge settings. Desktop is the live source; TUI and web entries are stored in the bridge. The phone still pairs once and sees the union.

- One pairing. One connection profile. No mobile changes.
- Desktop, TUI and web are configuration sources; the bridge stores the catalog, never conversations.
- Apache-2.0, no hosted service, no subscription.

## Requirements

- OpenCode Desktop 2.x with the GUI plugin API (`gui-experimental`). Pin the package version and upgrade it deliberately: the GUI API is experimental and changes between Desktop releases.
- Node.js 18+ to build the bundle.
- OpenCode Mobile (or any OpenCode v2 client) for the phone.
- Optional: Tailscale, WireGuard, or an authenticated HTTPS tunnel for remote access.

## Install

```bash
opencode plugin add @alvarolorentedev/opencode-desktop-bridge
```

`plugin add` writes the global `opencode.json(c)`, which is where Desktop reads plugins. Restart OpenCode Desktop, then open **Settings › Desktop Bridge** and turn it on. The plugin ships a GUI part and a TUI part; it adds no separate daemon and never modifies Desktop.

To build from source:

```bash
node scripts/build.mjs
```

Then add this directory to `plugins` in `opencode.json(c)`.

## Release

Tag `v<version>` after bumping `package.json`; `.github/workflows/release.yml` tests, publishes to npm with OIDC trusted publishing (no token), and creates the GitHub release.

Trusted publishing needs a one-time setup, because a package must exist before npm accepts a trusted publisher:

1. `npm login` with 2FA enabled on the account, then `npm publish` for `0.1.0`.
2. Register the workflow, either on npmjs.com under **Settings › Trusted publishing** (GitHub Actions, user `alvarolorentedev`, repository `opencode-desktop-bridge`, workflow `release.yml`) with **Allow npm publish** checked, or:

   ```bash
   npm trust github @alvarolorentedev/opencode-desktop-bridge \
     --repository alvarolorentedev/opencode-desktop-bridge \
     --file release.yml \
     --allow-publish
   ```

   New configurations allow only staged publishes by default, so `--allow-publish` is not optional.
3. Use it within 2 days: an unvalidated configuration expires. Bump to `0.1.1`, tag `v0.1.1`, and push the tag.
4. Optional hardening: **Settings › Publishing access › Require two-factor authentication and disallow tokens**.

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

- projects and sessions from every exposed server, merged;
- messages, prompts, streaming, permissions, questions, todos and diffs, routed to the owning server;
- terminals and WebSockets, tunneled to the owning server;
- files, VCS and worktrees for the project on screen;
- models, agents, commands and MCP configuration from the **configuration server** (Desktop’s own server by default).

Sessions keep their real IDs. Server identity does not leak: the phone never receives upstream URLs or credentials.

Leave the bridge profile’s **working directory** empty. The pairing flow does; a non-empty directory scopes the shared project and session lists to that one project.

## Add and remove servers

Every server Desktop lists (local, remote, SSH/WSL contributions), plus TUI and web entries, appears in the settings page.

- **Exposed** servers are visible to every paired device. New servers are exposed by default.
- **Hidden** servers are ignored by the bridge; the phone cannot see they exist.
- Hide a newly added server if the phone should not see it. No re-pairing is needed either way.
- Removing a server makes its projects and sessions disappear from the phone; an open chat on it reports that the session is no longer available.
- Re-adding the same URL restores it.

## Configure from the TUI or web

The bridge has one catalog with three sources:

- **Desktop**: every server Desktop reports, live.
- **TUI**: run `/bridge` in the TUI, then add or remove servers.
- **Web**: open **Settings › Desktop Bridge** in the web app, enter the bridge URL and admin token, and press **Sync this browser's servers**.

Duplicate URLs collapse; the Desktop entry wins. The phone does not need to re-pair: it sees the union on its next list or event.

### Tokens

- **Admin token**: Desktop **Settings › Desktop Bridge › TUI & Web**. The TUI and web settings pages use it to write the catalog. Treat it as a password; both clients store it locally.
- **TUI device token**: press **Create TUI token**, then:

  ```bash
  OPENCODE_PASSWORD=<token> opencode --server http://<bridge-host>:<port>
  ```

  This makes the TUI a client of the bridge, so it sees the same merged servers as the phone.

`/bridge` only edits the bridge. The TUI still needs `--server` to see the merged view.

The TUI part loads from the server that loads this plugin. The web settings page loads from the server that serves the web app. Both are Desktop’s own server by default.

## Security

- Binds `127.0.0.1` by default. Remote binding is an explicit choice.
- Data-plane requests and WebSockets require a device token.
- The control API requires the admin token. Desktop shows it; the TUI and web app store it locally.
- The bridge never sends upstream credentials to a client, and never logs tokens, pairing codes, prompts or source code.
- Pairing codes are 5-minute, single-use and rate-limited.
- Devices are revocable immediately; revocation closes their streams and sockets.
- One token currently grants every **exposed** server, including its terminal. Expose only machines you trust the phone with.
- Prefer Tailscale or a private network. HTTPS terminates in front of the bridge (Tailscale Serve, a reverse proxy, or a tunnel); the bridge itself is plain HTTP.
- TUI and web sources send upstream passwords to the bridge. Use a loopback bridge or HTTPS; the admin token is a bearer credential.

See [docs/security.md](docs/security.md) for the threat model.

## Known limits

The single-server view is an aggregation, not a new OpenCode engine.

- **Global configuration comes from one server** (Desktop’s own by default). A session on another server may use a model or agent that the selected configuration server does not list. Existing sessions keep working with their current model; changing models or creating a session with an unsupported model can fail.
- **Duplicate project paths** on two machines collapse into one project. New sessions and file operations for that path go to the configuration server.
- **Duplicate server URLs** collapse in the catalog by URL. Desktop wins over TUI and web entries.
- **TUI and web sources use Basic auth.** Manual servers authenticate with `opencode:<password>`. OIDC, custom gateway headers and per-server certificates must be configured in Desktop.
- **TUI and web sources are manual** and have no health state; an offline manual server fails per request and does not disappear from the list.
- **The web settings page is a configuration surface**, not a bridge client. The web app still talks to its own servers directly; the browser data-plane limits below remain.
- **Removing a server looks like deletion**, not like “server offline”. The app has no per-server health state in this mode.
- Sessions from different machines are distinguished only by their project path.
- Upstream servers must speak the v2 API. v1 servers, OIDC-protected servers, and connections that rely on custom gateway headers or per-server certificates cannot be exposed.
- The bridge runs only while Desktop is running. Non-sidecar servers become known through a Desktop window.
- Future API routes not handled explicitly are forwarded to the configuration server, or to the directory owner when the request carries a directory.

See [docs/architecture.md](docs/architecture.md) and [docs/limits.md](docs/limits.md).

## Development

```bash
node scripts/build.mjs   # dist/gui-experimental.cjs
node --test test/        # core, catalog, control, HTTP, SSE, WebSocket, bundle, web and plugin-main tests
```

The core has no Electron dependency: it takes server resolution, device storage, native pairing and the catalog sources as injected functions, so the proxy, aggregation and control plane are tested against real HTTP/SSE/TCP servers. See [docs/architecture.md](docs/architecture.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
