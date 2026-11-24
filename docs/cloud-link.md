# Future: Cloud Link

Cloud Link is not a dependency of this bridge. A single Cloud Link connector can expose the bridge later without changing the bridge protocol.

## Fit

The bridge already matches Cloud Link’s data-plane model:

- one local HTTP listener with `/api/*`, SSE and WebSocket upgrades;
- device authentication independent of the transport;
- a configurable public base URL, including a path prefix;
- no separate listener per upstream server.

A connector would expose **the bridge origin**, not each OpenCode server. All authorized servers remain behind the one endpoint.

## Requirements

1. **Streaming pass-through.** The connector must forward SSE without buffering and tunnel WebSocket upgrades. Cloud Link’s existing authenticated proxy already does both for OpenCode.
2. **Path prefixes.** The connector’s service path prefix must be configured as the bridge’s public URL, for example `https://m-….opencodecloud.link/bridge`. The bridge strips that prefix before routing and emits it in `/api/info` and pairing links.
3. **Two independent auth layers.** Cloud Link’s device credential protects the tunnel; the bridge’s `brg1_…` token protects the API. Neither replaces the other.
4. **No per-server endpoints.** Do not create one public endpoint per upstream server; that would leak the topology and multiply attack surface.
5. **Control plane unchanged.** Pairing for Cloud Link remains its existing device flow. Bridge pairing remains the native `opencode pair` redemption described in the architecture doc.
6. **Revocation.** Revoking the bridge device must close its streams; revoking the Cloud Link device must stop the tunnel. Both are independent and immediate.

## Migration

When a connector fronts the bridge, set the bridge’s **Public URL** to the connector URL and keep the bind address on loopback. Existing mobile profiles can be re-paired with the new URL; bridge tokens remain valid for their 30-day lifetime if the same bridge state is kept.

A hosted control plane must never receive prompts, source, or upstream credentials. That remains true because the connector only forwards bytes to the bridge.
