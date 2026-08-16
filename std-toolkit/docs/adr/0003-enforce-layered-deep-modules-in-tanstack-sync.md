# Enforce layered deep modules in TanStack Sync

Status: Superseded by the current [Sync Replica and Peer Sync model](../../src/sync/docs/adr/0001-peer-sync-is-a-freshness-path.md). The terminology below records the historical decision.

TanStack Sync is organized as deep modules in an acyclic layer graph: modules depend only on lower layers, and ordinary modules in the same layer remain independent. A same-layer dependency is allowed only through a deliberately shared Laymos module when the concept genuinely belongs at that layer; composition of ordinary sibling modules belongs in a higher layer. Fallible and asynchronous work stays in Effect, while a shared runner centralizes the imperative TanStack boundaries and uses an optional application `ManagedRuntime`. This trades some additional module doors and orchestration code for enforceable ownership, type-safe boundaries, and the ability to understand or replace one sync capability without loading the whole engine into working memory.

Lifecycle owns execution scopes, retries, cadence fibers, and teardown. Persistence owns serialized and schema-validated Source-of-Truth writes. Operational visibility is exposed as structured Effect events; the Inspector and its persistence/UI coupling are removed.

Workers own the sources required by their algorithms. A partition entry carries only a strategy and an optional repair capability; repair owns its own fetch source and cadence policy. This prevents unrelated workers from receiving a meaningless mandatory forward-fetch contract.
