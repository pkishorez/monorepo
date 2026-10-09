# Trace connection attempts and RPC invocations separately

Status: amended: `@kstackz/flow` was removed, so tracing now uses Effect spans instead of Flow Entries. A Connection Attempt is one span per Peer in a shared trace, and each RPC invocation gets its own client and server spans. The decision to trace them separately stands.

Each offer starts a bounded Connection Attempt Flow continued by the answering Peer, while every RPC call starts its own RPC Invocation Flow linked through the stable Peer Session Identifier. Transient disconnection that recovers on the same RTC Connection remains in its current Flow; replacement through a new offer starts a new one, and explicit disconnect starts nothing until connection is requested again. A single long-lived session Flow would mix concurrent RPC calls, violate Flow's one-open-Activation-per-Participant rule, and grow without bound; Peers therefore remain the only Participants and transport mechanisms remain attributes.
