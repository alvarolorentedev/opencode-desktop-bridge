# Security

The bridge is a privileged boundary: it can reach every exposed development machine with Desktop’s stored credentials, including its terminals.

## Defaults

- Listen on `127.0.0.1` only. Choosing a network address is an explicit action.
- **Pair over the internet** claims a random `bridge-…` route on the same OpenTunnel device tunnel as Desktop Remote access. The route URL is unguessable but is **not** authentication; the device token is.
- Data-plane routes except `GET /auth/connect/:code` require a device token. The control routes under `/bridge/v1/admin/*` require the bridge admin token **and** a loopback `Host`; the tunnel cannot reach them.
- Every exposed server is reachable through the same device token; hide servers you do not want the phone to reach.
- No hosted service, no telemetry, no external control plane.
- Upstream URLs and credentials never leave the bridge process. Desktop sources use `ctx.serverEndpoints`; TUI and web sources send their credentials to the bridge’s admin API and store them in plugin storage.

## Pairing

- Codes are issued by Desktop’s own background service through the native pairing API. The bridge does not mint codes.
- Codes are 5 minutes and single-use; the sidecar consumes them during redemption.
- The bridge rate-limits redemption attempts (10 per minute per address).
- The phone receives a bridge device token (`brg1_…`). The native sidecar token is discarded and never returned.
- Only a SHA-256 hash of each device token is stored; the token itself is not recoverable from Desktop storage.
- Device tokens expire after 30 days. Re-pair to renew.
- Pairing from a path-prefixed bridge should use the QR or the settings-page link; the CLI’s printed link loses path prefixes.
- The internet route is held by the plugin’s server part inside the local OpenCode server. The server part uses the installed OpenTunnel SDK and the user’s default device tunnel; it does not create a second account.
- The bridge and the native Remote access route are independent. Turning native Remote access off does not remove the bridge route; use the bridge’s **Advanced › Turn off internet access** or **Share servers** switch.
- The route name is stored in the bridge config. Resetting the OpenTunnel identity changes the hostname and requires re-pairing.

## Request handling

- Only paths under `/api/*` are forwarded. `/bridge/v1/*` is the bridge’s own metadata; `/bridge/v1/admin/*` is the admin control plane. Everything else is 404.
- The upstream URL comes from the catalog: Desktop’s `ctx.serverEndpoints` or a manual TUI/web entry. Only the admin token can add a manual entry; device tokens cannot select a destination, so the phone cannot use the bridge for arbitrary proxying.
- Admin routes require `Authorization: Bearer <admin token>` (or `x-bridge-admin-token`) **and** a loopback `Host`. The token is shown only in Desktop settings and stored by the TUI and web settings pages, which connect over loopback.
- CORS is enabled only for `/bridge/v1/admin/*`, so the local web settings page can call the control plane. The data plane still sends no CORS headers.
- `authorization`, cookies, `origin`, `referer` and hop-by-hop headers are removed from client requests and replaced with the upstream credentials.
- Response cookies, `www-authenticate`, `location` and hop-by-hop headers are stripped. Redirects are not followed.
- `/api/info` is rebuilt: no upstream URLs, hostname, PID or temp paths.
- Request and response bodies are streamed with backpressure; SSE has a bounded write queue. Event streams and WebSockets are capped per device and globally; a slow consumer is dropped and must reconnect, never buffered without limit. No conversation content is persisted.
- Logs contain fixed messages and safe fields (server id, status, error text). Tokens, pairing codes, query strings, prompts and file contents are not logged.

## Revocation

Revoking a device deletes its token hash and destroys its SSE streams and WebSocket tunnels. In-flight HTTP requests finish at most once; every subsequent request is 401. Hiding a server removes it from aggregated results and closes its streams, and its sessions stop routing.

## Threat model

| Adversary | Outcome |
|---|---|
| **Stolen pairing code** | Single-use, 5 minutes, rate-limited, and redeemable only before the desktop consumes it. No long-lived token is in the QR. |
| **Compromised phone** | Can use every exposed server’s API, including terminals, until revoked. It cannot see hidden servers, upstream credentials, or other devices’ tokens. Revoke from Desktop; agent permission rules still apply upstream. |
| **Unauthorized network client** | 401 everywhere except the rate-limited pairing endpoint. The admin API additionally refuses non-loopback `Host` with 403. Loopback-only by default. |
| **Malicious upstream server** | It receives only requests addressed to it. It cannot redirect the bridge to another destination, read other servers’ data, or inject credentials into responses (auth headers are stripped). Its responses are treated as untrusted data. |
| **Stolen bridge storage** | Contains device token hashes, the catalog configuration, the manual upstream passwords, the admin token and the tunnel route name. It does not contain usable device tokens or conversation content. A stolen admin token can add a malicious upstream only from the local machine; replace it by clearing the plugin’s `admin` store. |
| **Stolen admin token** | Can add or remove TUI/web upstreams from the local machine, including a malicious server the phone may then query. It cannot reach the admin API through the tunnel. Treat it like a password. |
| **Tunnel URL leak** | Knowing the random route URL is not enough: every data route requires a bridge device token, and the admin API refuses tunnel Hostnames. |
| **Same-path project on two machines** | Requests for that directory go to the configuration server; the other server’s sessions remain reachable by session ID. Documented, not a security boundary. |

## Deployment

- **Pair over the internet** uses the built-in OpenTunnel route; no port needs to be exposed and no separate tunnel is required.
- For the local/manual mode, prefer Tailscale, WireGuard, or another private network over exposing a port to the internet.
- For local HTTPS, terminate TLS in front of the bridge (Tailscale Serve, a reverse proxy, or an authenticated tunnel). The bridge does not implement TLS.
- Keep the bridge bound to loopback when using the built-in tunnel; the server part connects to it locally.
- Expose only the machines the paired phone should control. The token is bridge-wide, not per-server.
- Rotating Desktop’s server passwords does not revoke bridge devices; revoke them in the settings page.

## Reporting

Open an issue in the repository. Do not include pairing codes, tokens, prompts, or source code in reports.
