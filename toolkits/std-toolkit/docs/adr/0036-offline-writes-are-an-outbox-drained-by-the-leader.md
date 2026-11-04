# Offline writes are an Outbox drained by the leader

Sync's read side is durable — replicas, cursors, and strategy state survive
reloads — but a write is only as durable as the tab it was made in. An
optimistic mutation lives in TanStack DB memory until its Mutation Callback
confirms, so a reload, crash, or offline window loses the user's edit. This ADR
makes durability a property of the write itself, as an opt-in that changes
nothing when it is off.

## Every write is an Outbox Entry first

With `outbox: true` on a Std Sync, every front door — `insert`, `update`,
`delete`, `pacedUpdate`, and an Offline Action — does the same two things after
TanStack applies its optimism: the handler **writes one Outbox Entry** to the
Sync Store (the moment the edit is safe), then **waits until that Entry is
gone**. Gone by delivery resolves the handler, so TanStack drops the optimism
onto the confirmed Entity already in the Sync Replica; marked `failed` throws,
so TanStack's own rollback undoes it. There is no overlay layer: `$synced`
and `$origin` stay truthful for the whole offline window (the hand-rolled
pending counter is removed as redundant), and
awaiting a write blocks until delivery (Firestore semantics). Enqueue is always
an insert — never a read-then-merge — so any tab can enqueue at any time with
nothing to race.

## Coalescing happens in the Drainer, not in the store

Entity writes are not stored as one slot per Entity. Each transaction is its
own Entry; the Drainer folds every pending Entry of one Entity into one request
at Flight time (insert+updates → one insert, insert+delete → nothing,
update+update → merged changes, update+delete → delete). Folding in memory
keeps the store write trivial, makes the fold a pure unit-tested function,
and removes the "one in-flight plus one queued" state that a store-side slot
needs. The cost — one row per keystroke while offline — is nothing to
IndexedDB. Operations whose _intent_ spans Entities or must run on the server
are **Offline Actions**: a stable name, a schema'd payload, an `onMutate`
captured by TanStack's `createOptimisticAction` (so its writes never become
Entity Entries), and a `mutationFn` that is the Flight.

## One Drainer, one lock, Lanes as semaphores

One Drainer per Std Sync runs under one `Outbox Drain` Leadership lock. It
never hands Entries out: on each signal it lists the Lanes that have pending
work and forks `withPermit(work(lane))` on that Lane's semaphore. `work`
reads the Lane fresh while holding the permit, marks what it takes `in-flight`
(all pending Entries of an Entity; the oldest Entry of an action Lane), flies
it, and deletes it on success or marks it `failed` on error. In-flight
therefore means executing, never queued; duplicate triggers find nothing and
return; Lanes are strictly FIFO and mutually parallel. Losing the lock
interrupts the Drainer and every Flight; a new leader resets `in-flight` to
`pending` on start. Idempotency is the application's promise: a Flight killed
after its request landed is re-flown, and a non-idempotent operation is not an
Outbox candidate — it uses a plain optimistic action and stays online-only.

## The Outbox does not retry

A Flight returns, throws, or is interrupted. Return deletes the Entry, throw
marks it `failed` (its optimism rolls back, its Lane continues), interruption
leaves it `pending`. Retries, timeouts, and backoff are the Mutation Callback's
own business. The Drainer's only guards are connectivity and knowledge: no Flights while
the Platform reports offline, an Entry whose Flight Handler this tab has not
registered stays `pending` for a leader that has it (a missing handler is the
tab's gap, never the Entry's fault), and a callback may fail with the exported
`OutboxUnreachable` error to say "keep me pending" when it discovers the
Backend is not reachable after all. Halting a Lane on failure, per-call
opt-out, cancellation, and retrying a failed Entry from the Outbox are all
deferred until a real flow asks for them.

## `_u` stays server-minted; conflicts are arrival-order

The Backend receives the folded write with no edit-time stamp and applies
arrival-order last-write-wins, today's behavior. `_u` is the cursor axis, so
an edit-time value can never be written there, and comparing an edit-time
client stamp against a server-minted `_u` compares two clocks — a slow client
would lose every offline write silently. An edit-time conflict rule needs its
own client-minted field on the Entity and is deliberately not part of this
decision.

## One store, one election, no new durability knob

Outbox Entries are a stored entity in the existing Sync Store StdTable, so
Memory versus IndexedDB durability remains the Platform's single choice — an
in-memory Outbox survives a tunnel, a durable one survives a reload, and there
is no separate option for it. The version gate clears the Outbox with the rest
of the store; `reset()` stops every worker, wipes replicas, cursors, state,
and Outbox, re-seeds every Collection in place, and restarts — the logout path.
Cross-tab completion is a doorbell on a dedicated Outbox Channel; waiters
re-check the store on it, on Peer Messages, on `online`, and on a slow poll,
because the store, not the message, is the truth.

## Offline subsumes pacing

Pacing and the Outbox answer the same question — how rapid edits are spaced
before sending — one in memory, one durably. With an Outbox the Drainer's fold
already sends the latest state once per Entity per Flight, which is exactly the
coalesce pacer, so `pacedUpdate` becomes `update` and a Collection's `pacing`
option is ignored with a warning. Leaving the pacer in front of the handler
would hold edits in memory until the pacer released — never, offline, under the
coalesce and queue strategies — which is the very loss the Outbox exists to
prevent.

## Why not `@tanstack/offline-transactions`

The official package validates the architecture — outbox before dispatch,
named handlers, leader election, non-retriable error classification — and its
vocabulary and test scenarios are mirrored. It is not adopted: it persists an
operation diary with no cross-transaction coalescing, drains one global FIFO
where a stuck transaction blocks every Entity, does not persist writes from
non-leader tabs, and duplicates storage, election, and telemetry that
std-toolkit owns in Effect-native form.

## Out of scope

Field-level merge, CRDT collaborative editing, edit-time conflict stamps,
cross-tab visibility of unsent optimistic state, at-rest encryption, and
Outbox-level retry policy.
