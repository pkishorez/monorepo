import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import { coalesceStrategy } from '../../paced/index.js';

const transaction = (promise: Promise<void>) =>
  ({
    isPersisted: { promise },
  }) as never;

describe('TanStack Sync', () => {
  laymosDescribe(
    'Coalesce pacing',
    {
      description:
        'Coalesce pacing allows one request in flight and merges every intervening update into one trailing request.',
      documentation: `
Pacing controls when optimistic updates are committed to a server; it does not
change the optimistic collection itself. Coalesce is useful for controls that
can change repeatedly while a request is slow, such as a slider or autosaved
form.

The first update fires immediately. While its transaction is waiting for
\`isPersisted\`, later updates do not create parallel requests. They collapse
into one pending function, and the most recent function represents the merged
TanStack transaction. After success it fires once, optionally after a cooldown.

\`\`\`ts
const updatePacing = paceStrategy.coalesce({ wait: 100 })
\`\`\`

The gate is based on request completion rather than time. Cleanup cancels a
cooldown and forgets pending work. A failed in-flight request clears the gate;
the strategy itself does not retry because retry policy belongs to the caller.
      `,
    },
    () => {
      laymosTest(
        'Fires the leading update immediately.',
        {
          description:
            'No request is currently in flight. Executing the first transaction should call its function synchronously instead of waiting for a timer.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const strategy = coalesceStrategy();
            const calls: string[] = [];

            yield* trace(
              Effect.sync(() =>
                strategy.execute(() => {
                  calls.push('leading');
                  return transaction(Promise.resolve());
                }),
              ),
            );

            expect(
              calls,
              'The first paced update begins on the leading edge.',
            ).toEqual(['leading']);
          }),
      );

      laymosTest(
        'Collapses updates during an in-flight request into one trailing update.',
        {
          description:
            'The leading request is deliberately unresolved. Two more executions arrive; only the most recent pending transaction should run after the leading request succeeds.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            let resolveLeading: (() => void) | undefined;
            const leading = new Promise<void>((resolve) => {
              resolveLeading = resolve;
            });
            const strategy = coalesceStrategy();
            const calls: string[] = [];
            strategy.execute(() => {
              calls.push('leading');
              return transaction(leading);
            });

            yield* trace(
              Effect.promise(async () => {
                strategy.execute(() => {
                  calls.push('intermediate');
                  return transaction(Promise.resolve());
                });
                strategy.execute(() => {
                  calls.push('trailing');
                  return transaction(Promise.resolve());
                });
                resolveLeading!();
                await leading;
                await Promise.resolve();
              }),
            );

            expect(
              calls,
              'Only the leading and final coalesced transactions reach persistence.',
            ).toEqual(['leading', 'trailing']);
          }),
      );

      laymosTest(
        'Drops a pending cooldown when the collection cleans up.',
        {
          description:
            'A successful leading request has scheduled trailing work behind a cooldown. Cleanup represents collection teardown and must prevent that delayed request from firing afterward.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            let resolveLeading: (() => void) | undefined;
            const leading = new Promise<void>((resolve) => {
              resolveLeading = resolve;
            });
            const strategy = coalesceStrategy({ wait: 20 });
            const calls: string[] = [];
            strategy.execute(() => {
              calls.push('leading');
              return transaction(leading);
            });
            strategy.execute(() => {
              calls.push('trailing');
              return transaction(Promise.resolve());
            });
            resolveLeading!();
            yield* Effect.promise(() => leading);
            yield* Effect.promise(() => Promise.resolve());

            yield* trace(Effect.sync(() => strategy.cleanup()));
            yield* Effect.promise(
              () => new Promise((resolve) => setTimeout(resolve, 30)),
            );

            expect(
              calls,
              'Cleanup prevents the delayed trailing transaction from firing.',
            ).toEqual(['leading']);
          }),
      );
    },
  );
});
