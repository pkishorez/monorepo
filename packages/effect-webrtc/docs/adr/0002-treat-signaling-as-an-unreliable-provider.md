# Treat signaling as an unreliable provider

The core assumes signaling messages may be delayed, duplicated, reordered, or lost because both WebSockets and Nostr can exhibit those behaviors around reconnects. Connection Intent is therefore durable only inside a live Peer, while each negotiation attempt is identified, expiring, deduplicated, and safe to replace; this keeps Signaling Providers composable without forcing them to emulate a reliable queue.
