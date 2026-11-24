# Security

The bridge is a privileged boundary: it can reach every exposed development machine with Desktop’s stored credentials, including its terminals.

## Defaults

- Listen on `127.0.0.1` only. Choosing a network address is an explicit action.
- All routes except `GET /auth/connect/:code` require a device token.
- Every exposed server is reachable through the same device token; hide servers you do not want the phone to reach.
- No hosted service, no telemetry, no external control plane.
- Raw upstream URLs and credentials never leave Desktop.

## Pairing

- Codes are issued by Desktop’s own background service through the native pairing API. The bridge does not mint codes.
- Codes are 5 minutes and single-use; the sidecar consumes them during redemption.
- The bridge rate-limits redemption attempts (10 per minute per address).
- The phone receives a bridge device token (`brg1_…`). The native sidecar token is discarded and never returned.
- Only a SHA-256 hash of each device token is stored; the token itself is not recoverable from Desktop storage.
- Device tokens expire after 30 days. Re-pair to renew.
- Pairing from a path-prefixed bridge should use the QR or the settings-page link; the CLI’s printed link loses path prefixes.

## Request handling

- Only paths under `/api/*` are forwarded. `/bridge/v1/*` is the bridge’s own metadata. Everything else is 404.
- The upstream URL always comes from `ctx.serverEndpoints.get(id)`. No client input selects a destination, so the bridge cannot be used for SSRF or arbitrary proxying.
- `authorization`, cookies, `origin`, `referer` and hop-by-hop headers are removed from client requests and replaced with Desktop’s upstream credentials.
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
| **Unauthorized network client** | 401 everywhere except the rate-limited pairing endpoint. Loopback-only by default. |
| **Malicious upstream server** | It receives only requests addressed to it. It cannot redirect the bridge to another destination, read other servers’ data, or inject credentials into responses (auth headers are stripped). Its responses are treated as untrusted data. |
| **Stolen bridge storage** | Contains device token hashes, the hidden/server configuration, and the bridge secret used for cursors. It does not contain usable device tokens, upstream credentials, or conversation content. |
| **Same-path project on two machines** | Requests for that directory go to the configuration server; the other server’s sessions remain reachable by session ID. Documented, not a security boundary. |

## Deployment

- Prefer Tailscale, WireGuard, or another private network over exposing a port to the internet.
- For HTTPS, terminate TLS in front of the bridge (Tailscale Serve, a reverse proxy, or an authenticated tunnel). The bridge does not implement TLS.
- Keep the bridge bound to loopback when using a tunnel that connects locally.
- Expose only the machines the paired phone should control. The token is bridge-wide, not per-server.
- Rotating Desktop’s server passwords does not revoke bridge devices; revoke them in the settings page.

## Reporting

Open an issue in the repository. Do not include pairing codes, tokens, prompts, or source code in reports.
