# Wait for Peer availability with a one-shot stream

The Durable Signaling Provider exposes `WaitForPeer` as a streaming RPC that emits once and completes when a same-User Peer with the requested identifier is present and Connectable. Its high-level client presents the operation as an Effect, while the streaming wire shape lets hibernating RPC restore pending waits without polling or pinning the Durable Object in memory. Effect WebRTC uses this optional provider capability before creating each fresh Connection Attempt; providers without presence, such as Nostr, retain timeout-based retries.
