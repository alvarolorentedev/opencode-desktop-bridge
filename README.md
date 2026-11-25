# opencode-desktop-bridge

One OpenCode server on your phone for **every server configured in OpenCode Desktop, the TUI or the web**.

The plugin runs inside Desktop, exposes a single OpenCode v2 API, and combines the servers Desktop already knows about. Pair once from the settings page and scan the QR with OpenCode Mobile, then use existing projects, sessions and terminals without configuring each server on the phone.

Internet pairing joins the **same OpenTunnel** used by Desktop's **Settings › Pairing › Remote access**: the native service keeps its route, the bridge claims its own route on the same device tunnel. Local pairing keeps the old `opencode pair --url` flow for a LAN, Wi-Fi or manually exposed address. A phone can pair over the internet, on the network, or both.

The same server list can also be configured from the TUI (`/bridge`) or from the web app's Desktop Bridge settings under **Advanced**. Desktop is the live source; TUI and web entries are stored in the bridge. The phone still pairs once and sees the union.

- One pairing per address. One connection profile. No mobile changes.
- Desktop, TUI and web are configuration sources; the bridge stores the catalog, never conversations.
- Apache-2.0, no hosted service, no subscription.


## Requirements

- OpenCode Desktop 2.x with the GUI plugin API (`gui-experimental`). Pin the package version and upgrade it deliberately: the GUI API is experimental and changes between Desktop releases.
- Node.js 18+ to build the bundle. The internet tunnel runs in the OpenCode server process and uses the installed `@opentunnel/client` dependency (Node 22 or Bun 1.4+ at runtime).
- OpenCode Mobile (or any OpenCode v2 client) for the phone.
- Optional: Tailscale, WireGuard, or an authenticated HTTPS reverse proxy for the local/manual pairing mode.

## Install

```bash
opencode plugin add @alvarolorentedev/opencode-desktop-bridge
```

`plugin add` writes the global `opencode.json(c)`, which is where Desktop reads plugins, and installs the package's dependencies. Restart OpenCode Desktop so both the GUI part and the plugin's **server part** load. The server part owns the OpenTunnel route and the QR encoder; without it, internet pairing reports an error and local pairing keeps working.

To build from source:

```bash
npm install
node scripts/build.mjs
```

Then add this directory to `plugins` in `opencode.json(c)` and restart the server. Do not add a separate daemon; the bridge runs inside Desktop and its server part runs inside the OpenCode server.

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

1. In Desktop, open **Settings › Desktop Bridge**. **Share servers** starts the local listener.
2. Choose how the phone should reach the bridge:
   - **Pair over the internet** joins the same encrypted OpenTunnel device tunnel as **Settings › Pairing › Remote access** and claims a stable `bridge-…` route on it. It works anywhere. Remote access does not need to be switched on in the Pairing page; pairing over the internet creates or reuses the same tunnel.
   - **Pair on this network** uses the bridge's bind address. Set the bind address to `0.0.0.0` in **Advanced** for a LAN or Wi-Fi phone, or set a public URL for a reverse proxy.
3. Scan the QR with OpenCode Mobile, or copy the link. The code expires in 5 minutes and works once. The local card also shows the `opencode pair --url …` command.
4. The phone receives a bridge device token, not an upstream token, and stores it as a normal connection password.

Both modes can be used, even for the same phone. Pairing again over the other address creates a second profile or device entry; that is expected and keeps a LAN fallback for when the tunnel is unavailable.

The code is issued by Desktop's own background service. The bridge redeems it against that same service and issues its own device token. If the command and Desktop use different service instances (for example different CLI channels), redemption fails with a clear message; use the settings-page link instead.

If the bridge is mounted under a path prefix (for example `https://host/bridge`), use the QR or the settings-page link. The `opencode pair` **printed link** drops path prefixes because the CLI builds it from an absolute `/auth/connect/…` path.

## What the phone sees

One normal OpenCode v2 server:

- projects and sessions from every exposed server, merged;
- with more than one exposed server, project names and chat titles are prefixed with the owning server (`Studio · billing`), so the phone can tell them apart;
- the add-project folder browser opens on the server roots when more than one server is exposed: `/` and the browser's first listing show `@Studio`, `@Laptop`, … and `@Studio/…` browses that machine;
- messages, prompts, streaming, permissions, questions, todos and diffs, routed to the owning server;
- terminals and WebSockets, tunneled to the owning server;
- files, VCS and worktrees for the project on screen;
- models, agents, commands and MCP configuration from the **configuration server** (Desktop’s own server by default).

Sessions keep their real IDs. Upstream URLs and credentials never reach the phone.

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

These two surfaces are under **Settings › Desktop Bridge › Advanced**. They are optional: the main page only needs Desktop.

Duplicate URLs collapse; the Desktop entry wins. The phone does not need to re-pair: it sees the union on its next list or event.

### Tokens

- **Admin token**: Desktop **Settings › Desktop Bridge › Advanced › Admin token**. The TUI and web settings pages use it to write the catalog. Treat it as a password; both clients store it locally.
- **TUI device token**: press **Create TUI token**, then:

  ```bash
  OPENCODE_PASSWORD=<token> opencode --server http://127.0.0.1:47821
  ```

  This makes the TUI a client of the bridge, so it sees the same merged servers as the phone.

`/bridge` only edits the bridge. The TUI still needs `--server` to see the merged view.

Use `http://127.0.0.1:<port>` for the admin URL, even when the phone uses the tunnel. The admin API is loopback-only: requests carrying a public tunnel hostname are refused, so a browser on another machine cannot change the catalog.

The TUI part loads from the server that loads this plugin. The web settings page loads from the server that serves the web app. Both are Desktop’s own server by default.

## Security

- Binds `127.0.0.1` by default. Remote binding is an explicit choice.
- **Pair over the internet** claims a random `bridge-…` route on the same OpenTunnel device tunnel as Remote access. The route name is not authentication; the bridge device token is.
- Data-plane requests and WebSockets require a device token.
- The control API requires the admin token and is available only when the request's `Host` is loopback. Desktop shows the token; the TUI and web app store it locally and connect over loopback.
- The bridge never sends upstream credentials to a client, and never logs tokens, pairing codes, prompts or source code.
- Pairing codes are 5-minute, single-use and rate-limited.
- Devices are revocable immediately; revocation closes their streams and sockets.
- One token currently grants every **exposed** server, including its terminal. Expose only machines you trust the phone with.
- Prefer the built-in tunnel, Tailscale or a private network. For the local/manual mode, HTTPS terminates in front of the bridge (Tailscale Serve, a reverse proxy, or your own tunnel); the bridge itself is plain HTTP.
- TUI and web sources send upstream passwords to the bridge. Use a loopback bridge or HTTPS; the admin token is a bearer credential.

See [docs/security.md](docs/security.md) for the threat model.

## Known limits

The single-server view is an aggregation, not a new OpenCode engine.

- **Internet pairing needs one extra scan for an existing native profile.** The native Remote access route points at the bare OpenCode server; a plugin cannot redirect it. Pairing the bridge over the internet creates a bridge route and a bridge profile. Keep the old profile if it is still useful.
- **The plugin's server part must be loaded.** Internet pairing calls an RPC in the local OpenCode server that owns the OpenTunnel connection and QR encoder. Restart Desktop after installing or updating the plugin. If the server part is unavailable, local pairing still works.
- **The server part must run on the bridge's machine.** The default Desktop server is local. Pointing the bridge's configuration at a remote server does not move the tunnel target.
- **The tunnel URL is stable while the OpenTunnel identity exists.** Removing or resetting the device tunnel changes the hostname; paired phones must pair again. The route name is stored in the bridge config.
- **The Pairing page's Remote access switch is independent.** The bridge joins the same OpenTunnel identity but does not flip the native switch. Turning the native switch off does not remove the bridge route; use **Advanced › Turn off internet access** or turn off **Share servers**.
- **The admin API is loopback-only.** The TUI and web settings pages must use `http://127.0.0.1:<port>`, not the tunnel URL.
- **Global configuration comes from one server** (Desktop’s own by default). A session on another server may use a model or agent that the selected configuration server does not list. Existing sessions keep working with their current model; changing models or creating a session with an unsupported model can fail.
- **Duplicate project paths** on two machines collapse into one project. New sessions and file operations for that path go to the configuration server.
- **Server names are display-only.** With more than one server, project names and chat titles carry a `Server · ` prefix and the folder browser uses `@Server` roots; the real upstream names and titles are unchanged. Renaming a chat strips the prefix before it reaches the server.
- **The add-project browser opens on the server roots.** When more than one server is exposed, its first folder listing shows the `@Server` entries instead of the active project's contents; choose a server to browse that machine. Absolute folder listings also include the `@Server` entries.
- **A real folder named `@Server` is shadowed** by the matching server root. Use **Enter path manually** to reach it.
- **Windows server roots fall back to the server’s default location** when `/` cannot be listed; `@Server/…` browsing then stays inside that default folder.
- **Duplicate server URLs** collapse in the catalog by URL. Desktop wins over TUI and web entries.
- **TUI and web sources use Basic auth.** Manual servers authenticate with `opencode:<password>`. OIDC, custom gateway headers and per-server certificates must be configured in Desktop.
- **TUI and web sources are manual** and have no health state; an offline manual server fails per request and does not disappear from the list.
- **The web settings page is a configuration surface**, not a bridge client. The web app still talks to its own servers directly; the browser data-plane limits below remain.
- **Removing a server looks like deletion**, not like “server offline”. The app has no per-server health state in this mode.
- Sessions from different machines are distinguished by their project path, and with more than one exposed server the owning server name is prefixed to project names and chat titles.
- A chat title renamed on the phone is written back without the bridge prefix. An upstream title update event may briefly show the unprefixed title until the next list.
- Upstream servers must speak the v2 API. v1 servers, OIDC-protected servers, and connections that rely on custom gateway headers or per-server certificates cannot be exposed.
- The bridge runs only while Desktop is running. Non-sidecar servers become known through a Desktop window.
- Future API routes not handled explicitly are forwarded to the configuration server, or to the directory owner when the request carries a directory.

See [docs/architecture.md](docs/architecture.md) and [docs/limits.md](docs/limits.md).

## Development

```bash
npm install                # @opentunnel/client and the QR encoder
node scripts/build.mjs    # dist/gui-experimental.cjs
node --test                # core, catalog, control, HTTP, SSE, WebSocket, remote tunnel, bundle, web and plugin-main tests
```

The core has no Electron dependency: it takes server resolution, device storage, native pairing and the catalog sources as injected functions, so the proxy, aggregation and control plane are tested against real HTTP/SSE/TCP servers. The OpenTunnel controller is tested with a fake client; the real SDK is only loaded by the plugin's server part when **Pair over the internet** is used. See [docs/architecture.md](docs/architecture.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
