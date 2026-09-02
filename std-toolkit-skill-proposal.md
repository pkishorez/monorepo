# Proposal — a `std-toolkit` skill

A skill that walks someone from "I have a feature idea" to working code in three
phases: **model**, **expose**, **sync**. It is an interview, not a generator.
Each phase asks a fixed set of questions, writes down the answers, and only then
writes code.

Grounded in what already exists: `std-toolkit/src/{eschema,db,sync}` and the
bank demo at `apps/docs/src/demos/bank`, whose layering is already enforced by
`laymos.config.json`.

---

## 1. Why one skill, not three

The three phases share one vocabulary — the Entity, its id, its access patterns,
its cursor. Split into three skills, each would have to re-explain that
vocabulary, and phase 3 would routinely be invoked with no phase 1 output to
build on. So: **one skill, three phases, each phase resumable on its own.**

Entry points:

- `/std-toolkit` — full run, phase 1 → 3
- `/std-toolkit model` — just the table
- `/std-toolkit rpc` — RPC over an existing table
- `/std-toolkit sync` — collections over an existing RPC contract

Phases 2 and 3 begin by reading the existing `contract/` and `std-table/`
folders instead of asking again.

---

## 2. Folder structure

The bank demo's layering is already good and already enforced. The skill should
codify it rather than invent something new:

```
<feature>/
  CONTEXT.md          ubiquitous language + decisions      (phase 1)
  contract/           pure domain: eschemas, value rules, refusals, tuning
    <entity>/         one folder per entity schema
    refusal/          domain "no" — the errors the feature can return
    tuning/           every tunable number in one file
  std-table/          the storage binding                  (phase 1)
    table/            StdTable.make — topology, slots
    entities/<name>/  entity + access patterns
  rpc/                the wire                             (phase 2)
    contract/         RpcGroups, shared errors, roles
    mutations/        write handlers
    queries/          read + subscription handlers
  server/             compose handlers over any adapter → web handler
  client/                                                   (phase 3)
    api/              RpcClient + connection
    sync/             createStdSync + collections
    stores/           which adapter / which backend
  ui/                 dumb components, props in, callbacks out
  app/                wiring and live queries
```

Dependency direction, one way only:

```
app → client → server → rpc → std-table → contract
ui  → contract
```

Two deliberate changes from bank:

- **`rpc/subscriptions` → `rpc/queries`.** Not everything is a stream. A
  paginated HTTP fetch and a live WebSocket stream are the same access pattern
  with different delivery, and they belong in the same folder.
- **`client/` is trimmed.** Bank's `diagnostics`, `interaction-flow`, and
  tracing are demo instrumentation. The skill emits `api`, `sync`, `stores`,
  and one folder per action; the rest is offered, not assumed.

The skill also emits a `laymos.config.json` layer block so the direction above
is machine-checked from day one.

**Open question for you:** `whatever/code` uses a different layering
(`domain / services / orchestrators / handlers / contract`). Which one is the
house style? The proposal assumes bank's, because that is the one that actually
uses std-toolkit.

---

## 3. Phase 1 — Modeling

### 1a. Language before schemas

The repo already writes a `CONTEXT.md` per bounded context — nouns, one
paragraph each, with an `_Avoid_` line listing the words you refuse to use. The
bank's is the model to copy. The skill starts here, because a `Refusal` vs
`Failure` distinction found in prose is free, and found in code is a refactor.

Questions:

1. One sentence: what does this feature do?
2. What are the nouns? Which one is the aggregate — the thing that must change
   atomically?
3. For each noun: what identifies it, and what can never change about it?
4. What is deliberately *not* here? (bank: no closing an account, no editing a
   transfer)
5. What words are we banning? (bank bans "transaction" for a Transfer)

Output: `<feature>/CONTEXT.md`.

### 1b. Schema shape

For each noun, one question decides the construct:

| Answer | Construct |
| --- | --- |
| Many rows, each with its own id | `EntityESchema.make(name, 'id', fields)` |
| Exactly one row, ever | `ESchema` + `table.singleEntity()` |
| A scalar, enum, or union | `ValueESchema` |
| An object inside another schema | plain `ESchema` |

Then, per field:

- Does it encode to a **string**? Only string-encoded fields can be key
  components. Numbers and booleans cannot. This bites late; the skill asks
  early.
- Is it identity? Identity fields are frozen by **entity key immutability** —
  changing one is delete + insert, never an update.
- Will it change shape later? If yes, mention it now; `.evolve('v2', …)` is
  cheap to plan and awkward to retrofit.

### 1c. Access patterns — the core of the phase

This is where most of the thinking should happen. The mechanics, which the skill
must state plainly because they are not obvious:

- **Primary sort key is always the id field.** You only choose the primary pk
  components. `{ pk: [] }` puts every row of that entity in one item collection.
- **A GSI's sort key defaults to `['_u']`** — a ULID, so time-ordered. That
  default *is* the old→new backbone. You get "everything, oldest first" for
  free.
- **A GSI needs explicit pk components. An LSI inherits the primary pk** and
  only names a new sort key.
- **Slot budget: 20 GSI, 5 LSI per table.** Slots are shared across entities —
  bank puts `account.byUpdated` and `transfer.byFrom` both on `GSI1`. But one
  entity may use each slot only once. So the real budget is *per entity*, and
  slot assignment is a table-level conversation.
- **Sort conditions**: `=`, `<`, `<=`, `>`, `>=`, `between`, `beginsWith`.
  `<` and `<=` return **descending**; everything else ascends. Direction is a
  consequence of the operator, not a separate flag.
- **Pagination is `after: lastEntity`** — you hand back the last entity you got,
  not a token.

The skill drives this with a worksheet, filled in English first and translated
second:

| # | Read route, in English | Entity | pk components | sk | Direction | Slot | Consumed by |
|---|---|---|---|---|---|---|---|
| 1 | Every account, oldest first | account | — | `_u` | asc | GSI1 | sync total |
| 2 | Transfers this account sent | transfer | `from` | `_u` | asc | GSI1 | sync partition |
| 3 | Transfers this account got | transfer | `to` | `_u` | asc | GSI2 | sync partition |

Questions that fill it:

1. List every way the app asks for these records. Plain sentences.
2. For each: filter by what, ordered by what, newest or oldest first?
3. How big can one partition get? A pk of `[]` is one item collection for the
   whole entity — fine at ten thousand rows, a problem at ten million.
4. Which adapter? DynamoDB GSIs are eventually consistent; SQLite and IDB are
   not. If a route must read its own write immediately, it cannot be a GSI route
   on Dynamo.
5. Do deletes need to reach clients? If yes, tombstones (default `delete`), not
   `hardDelete` — sync needs to see the deletion.

Validation the skill runs before writing code: every pk/sk component is
string-encoded, every pk component is immutable, no entity reuses a slot, the
table is within 20/5.

### 1d. Actions — the transaction model

You asked for this explicitly: name the actions, then brainstorm each one as a
modeling problem. Per action:

1. What does it read, what does it write?
2. Does it touch more than one item atomically? → `transact` with ops.
3. What can the domain refuse, and is that refusal permanent? Bank's
   **Refusal** (the bank said no — retrying gives the same answer) vs
   **Failure** (it never arrived — retrying may work) is the right distinction
   and should be a default question, not a bank quirk.
4. What must hold at commit time? Three different tools, often confused:
   - `check` — an **entity invariant**, plain JavaScript over the value
     `transact` reads at commit. This is where "balance must still be enough"
     lives.
   - `_u` guard — optimistic concurrency; nothing moved since the read.
   - `lastWriteWins` — no guard. Mutually exclusive with `check`.
5. What happens on contention? Bank retries three times, then dies. Say the
   number out loud.
6. **Is it idempotent?** If the client can retry, or the UI shows it
   optimistically before it commits, the **client must supply the id** —
   see `transfer({ id, … })`. This is the hinge that makes phase 3's optimistic
   writes work, so phase 1 has to decide it.

One trap worth naming in the skill: you cannot put a separate check op on an
item the same batch writes. A rule about an item you are writing goes in that
op's `check`.

Output: an `ACTIONS.md` table, and the `contract/` + `std-table/` code.

---

## 4. Phase 2 — RPC

Two groups, as bank has them: **mutations** and **queries**. Merged into one
`RpcGroup` for the server.

### The query side — old→new, in detail

This is the part you singled out, and it has exactly one trap that matters.

**The cursor is exclusive.** Given a cursor, return rows *strictly* after it.
The sync README is blunt about why: a paginated source pages until it gets an
empty batch, so an inclusive backend re-serves the boundary row forever. The
skill's rule: use `after: cursor`, or `>` / `<` — never `>=` / `<=` against a
cursor value.

Conventions the skill enforces:

- The payload key is the comparator symbol, not the word "cursor" —
  `payload: { '>': Schema.NullOr(AccountEntity) }`. That is `practices.md`, and
  it reads as "give me what's after this".
- The cursor is a **whole entity**, not a token. `null` means "from the start".
- A streaming route's success is a **batch** — `Schema.Array(Entity)` with
  `stream: true`.
- Partition parameters become payload fields: `subscribeTransfersFrom({ from, '>' })`.

Every live route is the same two-part shape, which the skill ships as a
template:

```
catch up  →  query from the cursor, page until hasMore is false
   then
tail      →  entity.subscribe(filter), coalesced with groupedWithin
```

Bank's `watch` helper in `rpc/subscriptions/subscriptions.ts` is exactly this,
and generalizes without change.

Questions:

1. Which access patterns cross the network at all? Some stay server-only.
2. Transport: request/response HTTP, or a long-lived stream (WebSocket, Durable
   Object)? This picks `paginated` vs `live` in phase 3 and is the one answer
   both phases need.
3. Push or poll? Poll is the honest answer when the backend cannot push.
4. Batch coalescing: how many rows, how long a window? (bank: 20 rows / 50ms)
5. Page size while catching up? (bank: 1000)
6. Does the host hibernate? If yes, the subscription needs a checkpoint so it
   resumes from where it slept, not from the client's stale cursor.

### The mutation side

One RPC per action from phase 1's `ACTIONS.md`. The mapping is direct:

- action inputs → `payload` (including the client-supplied id, where phase 1
  said so)
- domain refusals → the typed `error` schema
- infrastructure failures → `Effect.orDie`, never on the wire
- the written entities → `success`, so the client can apply them to its replica
  without waiting for the stream to catch up

Questions:

1. Who is allowed to call each one? Roles ride as a `Context.Reference` with a
   default (bank: `guest`), and a guard effect in front of the handler.
2. Does the caller need the written rows back, or just an ack?
3. Serialization: NDJSON (streams) or JSON (WebSocket)?

`server/` then does one thing: merge the handler layers, provide the table
layer, the broadcaster, and the role — and stay adapter-agnostic, so the same
server runs over IDB in the browser and SQLite in a Durable Object. Bank proves
this and it is worth keeping as a hard rule.

---

## 5. Phase 3 — Sync

One `createStdSync` per backend dataset, one collection per entity.

The wiring is mechanical once phases 1 and 2 are done — each RPC query becomes
one source:

| Phase 2 answer | Phase 3 source |
| --- | --- |
| streaming route | `live({ open })` |
| HTTP paginated route | `paginated({ fetch })` |
| no push, no paging | `poll({ fetch, schedule })` |
| singleton | `once` / `subscribe` |

And each access pattern becomes either `sync.total` (one route, no parameter) or
an entry in `sync.partitions` (route with a parameter). A partition key must be
a string, number, or boolean field of the schema — worth checking back in phase
1.

Strategy choice is a UX question, not a technical one:

- **`oldToNew`** — drain from the beginning, keep going. Right when the client
  wants the whole set, and the newest rows are not more urgent than the oldest.
- **`newToOld`** — newest first, backfill behind it. Right for a feed where the
  top of the list is what the user looks at.
- **`bidirectional`** — newest first, fill from both ends.

Questions:

1. Per collection: total, partitioned, or both?
2. Does the UI need newest-first? (→ `newToOld`) Or is it a complete working
   set? (→ `oldToNew`)
3. Durability: memory, or IndexedDB that survives reload? Multiple tabs?
   (`platform: browser()` gives IDB + leadership + peer sync)
4. Which mutations are optimistic? For each, the three-step pattern:
   `onMutate` writes the guess → RPC call → `utils.applyToSyncReplica(result)`.
   Bank also serializes them behind a semaphore so balances settle in order —
   worth asking whether ordering matters.
5. `version` — bump it whenever the backend is wiped or reshaped, or old
   clients keep showing stale data forever.
6. Large collections? Add a `BTreeIndex` on the fields you page and look up by.
7. `gcTime` for partitioned collections that come and go.
8. Does anything need cadence repair (a periodic re-read to heal missed pushes)?

---

## 6. What the skill ships

```
.claude/skills/std-toolkit/
  SKILL.md                     phase router, the interview, the gates
  references/
    01-language.md             CONTEXT.md convention, Refusal vs Failure
    02-schemas.md              eschema constructs, evolution, string-encoding
    03-access-patterns.md      key derivation, slot budget, operators, worksheet
    04-actions.md              transact, invariants, contention, idempotency
    05-rpc-contract.md         groups, cursor conventions, errors, roles
    06-rpc-queries.md          catch-up + tail template, the exclusivity trap
    07-rpc-mutations.md
    08-sync.md                 strategies, sources, partitions, optimistic writes
    09-structure.md            folders + laymos config
    10-review.md               the pre-flight checklist
  templates/                   one skeleton file per folder above
  worksheets/
    access-patterns.md
    actions.md
```

The review checklist (`10-review.md`) is the highest-value file. Drafted:

- [ ] Every index component encodes to a string
- [ ] Every pk component is immutable for the row's life
- [ ] No entity uses the same slot twice; table within 20 GSI / 5 LSI
- [ ] Every cursor comparison is exclusive
- [ ] Cursor payload keys are `>` / `<`, and carry whole entities
- [ ] Every multi-item write goes through `transact`
- [ ] No `check` on an item the same batch writes — it belongs in that op
- [ ] Every optimistic action takes a client-supplied id
- [ ] Domain refusals are typed on the wire; infra failures are `orDie`
- [ ] Deletes that must sync are tombstones, not `hardDelete`
- [ ] The server layer names no adapter
- [ ] `laymos` passes

---

## 7. Suggested order of work

1. Agree the folder structure, and settle the bank-vs-`whatever/code` layering
   question.
2. Write `SKILL.md` plus `03-access-patterns.md` and `06-rpc-queries.md` — the
   two references carrying the real knowledge.
3. Test it honestly: run the skill blind against the bank's own requirements and
   diff its output against the committed bank code. Whatever it gets wrong is
   the reference file that needs work.
4. Fill in the remaining references and templates.
5. Second test on a feature that is not a bank — something with a singleton, a
   composite pk, and a newest-first feed, since bank exercises none of those.

## 8. Open questions

1. Bank's layering or `whatever/code`'s — which is canonical?
2. Should the skill emit `laymos.config.json` blocks, or is that a separate
   step?
3. How much does the skill write versus propose? Full code, or scaffolding plus
   TODOs?
4. Is `CONTEXT.md` mandatory for every feature, or only for real bounded
   contexts?
5. Should phase 1 also emit a `std-toolkit.snapshot.ts` entry, so contract drift
   is caught in CI from the first commit?
