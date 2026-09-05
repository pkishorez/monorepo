# Sync layers are the story's zoom levels

ADR 0006 cut Sync into `features / kernel / domain`. Those are not words anyone
uses to explain Sync: a developer says "a Std Sync is a group of Collections;
a Collection runs Global Sync, Partition Sync, and Cadence Repair; every write
goes through the Outbox; one tab leads." The folders should say the same.

We layer Sync by the zoom levels of that story, top down, each layer knowing
only the layers below it:

- `std-sync` — the instance: the group of Collections, one Outbox, the Ready
  Gate, Reset.
- `collection` — one Collection: the keyed and single-item doors, Strategy
  Sessions, mutations, Replica, Projection, the Registry.
- `strategy` — how backend-confirmed Entities are obtained: presets, Sync
  State, Cadence Repair.
- `outbox` — the durable write path: Entries in Queues, the Drainer, Handlers,
  Waiters, Offline Actions.
- `worker` — what a loop is: the Supervisor under a Leadership role, Sync Flow.
- `platform` — the environment: the contract, Sync Store, Leadership, Peer
  Sync, the Effect runner, the browser preset.
- `domain` — vocabulary only: branded identities, stored entity schemas,
  events, errors, contracts.

Inside a layer, placement follows one rule: a part with one consumer lives
inside that consumer's folder as interior (`hybrid-sync/` under the keyed door,
`source/` under the strategy presets, `ready-gate.ts` under the facade); a part
with several consumers is a graph member with declared rules; a part consumed
from a higher zoom level is a layer below.

## The trade-off

Interior folders are not linted by Laymos; we accept that precisely because
they have one owner. The `worker` layer is two modules, and `platform` exposes
every member, which Laymos treats as a design exception; both are the price of
layer names a reader can map onto the story without a legend.

## What changed with it

- The Outbox is a layer below Collections, so the `outbox-port` and
  `platform-port` modules disappear; Collections depend on the Outbox door.
- Cadence Repair is configured per Global Sync or Partition Sync and reported
  as a child of that Strategy Session; single-item Collections have none.
- A single-item Collection is one Strategy Session on the global key; the
  separate single-item lifecycle is gone and its Sync State moves from the
  `__single__` key to the global key.
- Lane, Flight, Flight Handler, and Flight Registry are retired for Queue,
  Request, and Handler. The stored Entry column and index follow, so the Sync
  Store version must move with this change.
- Every name Sync mints is a branded type in `domain/identity`.
