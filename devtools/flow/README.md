# @pkishorez/flow

Flow journals for Effect programs: participants record what happened, DevTools shows it as a swim lane

## Big picture

A trace tells you where time went. It does not tell you who talked to whom,
who was waiting, or what a process believed at the time. A Flow is a Journal
of exactly that: Participants append Entries (events, messages, replies,
activations, waits, checks, close) under one Flow id, and any process that
knows the id writes to the same Journal. Nothing is declared up front.

Entries go to the runtime's Flow Telemetry. Without one they are dropped.
`FlowTelemetry.layerMemory` keeps them for tests and Stories;
`FlowTelemetry.layer` batches them to a Flow Store over RPC. The
[@pkishorez/devtools](../devtools/README.md) DevTools Server hosts that store and renders
each Journal as swim lanes. `projectJournal` is the one read model a renderer
consumes. Entries recorded inside a span carry the span's ids, which is how
the Flow view links into [@pkishorez/lotel](../lotel/README.md) traces.

Terms are defined in [CONTEXT.md](./CONTEXT.md). Decisions are in
[docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @pkishorez/flow
```

Peer dependencies:

- `effect` (`4.0.0-rc.112`): Participants write Entries as Effects and
  `FlowTelemetry` is an Effect Reference.

## Exports

### `@pkishorez/flow`

Runs anywhere Effect runs.

| Export                        | What it does                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `Flow.make`                   | Returns a Flow for an id; `flow.participant(name)` gives the writer for one lane.                 |
| `Activation.completed`        | Outcome for an Activation that finished normally.                                                 |
| `Activation.failed`           | Outcome for an Activation that failed, carrying the error.                                        |
| `Activation.interrupted`      | Outcome for an interrupted Activation, with an optional reason.                                   |
| `Activation.fromExit`         | Derives an Outcome from an Effect Exit.                                                           |
| `FlowTelemetry`               | The Reference every Participant writes to; defaults to a sink that discards.                      |
| `FlowTelemetry.layer`         | Layer that forwards Entries to a Flow Store over RPC with batching, retries, and drain.           |
| `FlowTelemetry.layerMemory`   | Layer that keeps Entries in memory.                                                               |
| `FlowTelemetry.makeMemory`    | Builds a memory sink to hold yourself; exposes `journal`, `journals`, `changes`, and `clear`.     |
| `EntrySchema`                 | The union of every Entry kind.                                                                    |
| `entryKinds`                  | The list of Entry kind names.                                                                     |
| `SeveritySchema`              | Entry severity levels.                                                                            |
| `ActivationOutcomeSchema`     | `completed`, `failed`, or `interrupted`.                                                          |
| `AttributeValueSchema`        | A JSON-compatible attribute value.                                                                |
| `AttributesSchema`            | A record of attribute values.                                                                     |
| `JournalSchema`               | One Flow's Entries with their ordering.                                                           |
| `JournalOrderingSchema`       | `recorded` or `clock`.                                                                            |
| `JournalFileSchema`           | The versioned file form of a Journal for export.                                                  |
| `groupJournals`               | Splits a flat list of Entries into one Journal per Flow, in recorded order.                       |
| `mergeJournals`               | Combines Journals of one Flow from several origins into one clock-ordered Journal, deduped by id. |
| `toJournalFile`               | Converts a Journal to its file form.                                                              |
| `fromJournalFile`             | Reads a Journal back from its file form.                                                          |
| `projectJournal`              | Derives the Projection: participants, paired Activations and Waits, warnings, and status.         |
| `ProjectionSchema`            | The Projection shape a swim-lane renderer consumes.                                               |
| `ProjectedActivationSchema`   | One Activation Start paired with its End and Outcome.                                             |
| `ProjectedWaitSchema`         | One Wait paired with its Resume.                                                                  |
| `ProjectionWarningSchema`     | One authoring mistake found while projecting.                                                     |
| `ProjectionWarningKindSchema` | The four warning kinds.                                                                           |
| `FlowStatusSchema`            | `active`, `failed`, `quiet`, or `closed`.                                                         |

### `@pkishorez/flow/rpc`

Browser-safe. The contract between a process and a Flow Store.

| Export                         | What it does                                                            |
| ------------------------------ | ----------------------------------------------------------------------- |
| `FlowRpc`                      | RPC group with `WriteFlowEntries`, `ListFlowEntries`, and `ClearFlows`. |
| `FlowRpcError`                 | Error carrying a store failure message.                                 |
| `FlowCursorSchema`             | A cursor over the store's write stamp: `>`, `>=`, `<`, or `<=` a value. |
| `StoredEntrySchema`            | An Entry with the write stamp the store assigned.                       |
| `WriteFlowEntriesResultSchema` | Accepted and rejected counts.                                           |
| `ListFlowEntriesResultSchema`  | A page of stored Entries.                                               |
| `ClearFlowsResultSchema`       | How many Entries were deleted.                                          |

### `@pkishorez/flow/client`

Browser-safe. Uses `fetch`.

| Export                   | What it does                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| `FlowRpcClient`          | Service holding an RPC client bound to one Flow Store.               |
| `makeFlowRpcClientLayer` | Builds the `FlowRpcClient` layer for an endpoint, posting to `/rpc`. |
| `DEFAULT_FLOW_ENDPOINT`  | `http://127.0.0.1:14400`.                                            |

## Usage

### Record a Flow and read its Journal in a test

Two Participants exchange a message inside an Activation. A memory sink
collects the Entries, and the Journal lists them in recorded order.

```ts
import { Effect } from 'effect';
import { Flow, FlowTelemetry } from '@pkishorez/flow';

const sink = FlowTelemetry.makeMemory({ origin: 'test' });
const flow = Flow.make({ id: 'transfer:1' });
const user = flow.participant('app/user');
const bank = flow.participant('app/bank');

await Effect.runPromise(
  Effect.gen(function* () {
    const ask = yield* user.send(bank, 'Transfer 10', {
      attributes: { amount: 10 },
    });
    yield* bank.activated('Process transfer')(
      Effect.gen(function* () {
        yield* bank.event('Validated');
        yield* bank.check('amount is positive', true);
        yield* bank.waiting('network')(Effect.void);
        yield* bank.reply(ask, 'Settled');
      }),
    );
    yield* user.close();
  }).pipe(Effect.provideService(FlowTelemetry, sink)),
);

const journal = sink.journal('transfer:1')!;
journal.entries.map((entry) => entry.kind);
// ['message', 'activation-start', 'event', 'check', 'wait', 'resume',
//  'message', 'activation-end', 'close']
```

How it works:

- `send` returns a token; `reply` with that token closes the round trip.
- `activated` wraps an Effect in an Activation whose Outcome is its Exit;
  `activation.start` opens one you end yourself with an `Activation` value.
- `waiting` writes a Wait before and a Resume after the Effect.
- Without a sink, Entries are dropped and tokens are still returned.

### Project a Journal for a renderer

`projectJournal` pairs Activations and Waits, computes a status, and warns
only about authoring mistakes.

```ts
import { Effect } from 'effect';
import { Flow, FlowTelemetry, projectJournal } from '@pkishorez/flow';

const sink = FlowTelemetry.makeMemory();
const flow = Flow.make({ id: 'fails' });

await Effect.runPromise(
  Effect.fail('boom').pipe(
    flow.participant('worker').activated('Job'),
    Effect.ignore,
    Effect.provideService(FlowTelemetry, sink),
  ),
);

const projection = projectJournal(sink.journal('fails')!);
projection.activations; // [{ name: 'Job', outcome: 'failed', participantName: 'worker', ... }]
projection.status; // 'failed'
projection.warnings; // []
```

How it works:

- The four warnings: an Activation Start while one is open, an End with none
  open, a Reply to an unknown Message, and a Resume with no open Wait.
- An open Activation or unanswered Wait is a state, not a warning.
- `mergeJournals` first when several origins recorded the same Flow.

### Send Flows to DevTools

Provide `FlowTelemetry.layer` at the runtime root and every Flow in that
runtime lands in the DevTools Flow Store.

```ts
import { Layer, ManagedRuntime } from 'effect';
import { FlowTelemetry } from '@pkishorez/flow';

const runtime = ManagedRuntime.make(
  FlowTelemetry.layer({
    endpoint: 'http://127.0.0.1:14400',
    origin: 'browser:alice',
  }),
);

// ...run the program with runtime.runPromise, then:
await runtime.dispose(); // drains the last batch
```

How it works:

- Entries batch every 100 ms or 100 Entries and post `WriteFlowEntries` to
  `<endpoint>/rpc`.
- Retries twice; if the store is unreachable the batch is dropped with one
  warning and the program never fails.
- `origin` distinguishes processes that share Participant names.
