---
status: accepted
---

# Use opt-in Leadership for backend reads

Std Sync will support explicit Leadership so equivalent participants do not repeat the same backend-reading work. Leadership is an optimization over the existing correctness path: users opt in with a Layer, and mutations, Registry Broadcasts, Peer Sync, projection, and Sync Replica writes remain outside it.

## Decision

One participant owns each exact backend-reading role. Its identity contains the qualified Collection Name, exact global or Partition key, role kind, and strategy name when the role runs a Sync Strategy; display-only Sync Addresses are never identities. A successful finite worker retains Leadership until its Collection or Partition lifecycle ends, while a failed attempt releases Leadership before a randomized retry so another participant can take over.

The capability has two separately importable implementations:

- Web Locks coordinates same-origin browser participants and directly handles document lifecycle. It can release when the document becomes hidden or frozen.
- In-memory Leadership uses Effect semaphores shared by callers of the same Layer instance, primarily for stories and tests.

There is no default implementation, environment detection, or silent fallback. Selecting Web Locks where `navigator.locks` or `document` is unavailable fails clearly.

## Consequences

Web Locks Leadership should normally be paired with a cross-tab Sync Store such as IndexedDB. With isolated Memory Sync Stores, a late follower can miss earlier Peer Messages and remain without the leader's existing Sync Replica data; opting in accepts that constraint.
