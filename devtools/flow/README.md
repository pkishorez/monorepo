# @pkishorez/flow

Flow Journals for Effect programs. Participants record what happened as an
append-only Journal, and DevTools draws each Journal as a swim lane.

A Flow is identified only by its id. Every process that calls `Flow.make` with
the same id writes the same Journal, so nothing is registered and nothing is
declared up front: Participants attach as the program runs.

```sh
npm install @pkishorez/flow
```

Requires `effect@4.0.0-rc.112` as a peer dependency.

## Recording

```ts
import { Effect } from 'effect';
import { Activation, Flow } from '@pkishorez/flow';

const flow = Flow.make({ id: 'transfer:42' });
const user = flow.participant('app/user');
const bank = flow.participant('app/bank');

const program = Effect.gen(function* () {
  const ask = yield* user.send(bank, 'Transfer 10 · A → B');
  yield* bank.activated('Process transfer')(
    Effect.gen(function* () {
      yield* bank.check('amount is positive', true);
      yield* bank.waiting('network')(commit);
      yield* bank.reply(ask, 'Settled');
    }),
  );
  yield* user.close();
});
```

A Participant writes eight kinds of Entry: `event`, `send` and `reply`
(Messages), `activation.start` and `activated` (Activations with an Outcome),
`wait` and `resume` or `waiting` (a Participant suspending its own work),
`check` (a condition, shown but never enforced), and `close` (a hint that the
Flow is finished). Activations that outlive a fiber use `activation.start` and
end themselves with `Activation.completed()`, `Activation.failed(cause)`, or
`Activation.interrupted()`.

Every Entry carries the Participant's sequence, the recording clock, an
optional origin, and the trace id and span id of the span it ran inside.

## Flow Telemetry

Entries go to the runtime's Flow Telemetry. Without one they are discarded,
the same way an Effect program traces nothing until a Tracer is provided.

```ts
import { Layer } from 'effect';
import { FlowTelemetry } from '@pkishorez/flow';

// Forward every Flow in the runtime to DevTools.
const FlowLive = FlowTelemetry.layer({ endpoint: 'http://127.0.0.1:14400' });

// Or keep them in memory, for tests and Stories.
const sink = FlowTelemetry.makeMemory();
await Effect.runPromise(
  program.pipe(Effect.provideService(FlowTelemetry, sink)),
);
sink.journal('transfer:42'); // the Journal
```

`FlowTelemetry.layer` batches Entries, retries, drains on shutdown, and drops a
batch with one warning when DevTools is unreachable. Telemetry never fails the
program.

## Journals and Projections

```ts
import { mergeJournals, projectJournal } from '@pkishorez/flow';

const projection = projectJournal(journal);
projection.activations; // paired Activation Start and End, with Outcome
projection.waits; // paired Wait and Resume
projection.warnings; // only authoring mistakes
projection.status; // active, failed, quiet, or closed

const merged = mergeJournals([clientOne, clientTwo]); // clock ordered
```

`projectJournal` is the one contract a swim-lane renderer consumes. It warns
about four things only: an Activation Start while one is open, an Activation
End with none open, a Reply to a Message the Journal does not contain, and a
Resume with no open Wait. An open Activation or an unanswered Wait is a state,
not a Warning.

## `@pkishorez/flow/rpc` and `@pkishorez/flow/client`

The RPC contract a Flow Store fulfils (`WriteFlowEntries`, `ListFlowEntries`
by cursor, `ClearFlows`) and a browser client for it. DevTools hosts the store.

## License

MIT
