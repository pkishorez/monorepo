---
'@kstackz/effect-webrtc': patch
---

Breaking: Peer Sessions are traced with Effect spans instead of Flow. On the wire, `NegotiationEnvelope`'s `flow` field is now `trace`, so a Peer on 0.0.0 cannot negotiate with one on this version; update every Peer and redeploy the Durable Signaling worker together. `FlowCarrierSchema`, `FlowMessageTokenSchema` and `FlowCarrier` are removed, and so is the `@kstackz/flow` peer. Needs Effect `^4.0.0`; the optional `alchemy` peer is now `2.0.0-beta.80`.
