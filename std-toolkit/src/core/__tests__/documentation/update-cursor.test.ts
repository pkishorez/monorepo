import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import { Ulid, nextUlid, uTime } from '../../index.js';

describe('Core', () => {
  laymosDescribe(
    'Update cursor',
    {
      description:
        'Update cursors give every committed entity change a sortable identity and an embedded time.',
      documentation: `
The core \`_u\` field answers two questions at once: “which state is newer?” and
“approximately when was it created?” By default std-toolkit uses monotonic
ULIDs. Their lexical order is their chronological order, so adapters and sync
engines can compare opaque strings without coordinating a separate sequence.

Monotonicity matters when several changes happen inside one clock millisecond.
A normal timestamp would tie; the module-scoped ULID factory increments the
random portion so every later call is still strictly greater.

\`\`\`ts
const updateCursor = yield* nextUlid
const committedAt = uTime(updateCursor)
\`\`\`

\`uTime\` also accepts ISO timestamps because an adapter may use a different
cursor format. Invalid strings return \`null\` instead of throwing. Tests and
deterministic runtimes can replace the \`Ulid\` service without changing
production callers.
      `,
    },
    () => {
      laymosTest(
        'Produces strictly ascending cursors during a burst of changes.',
        {
          description:
            'One hundred changes may occur before the clock advances. Every generated cursor must still sort after the previous cursor so convergence never sees a tie.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const cursors = yield* trace(
              Effect.forEach(Array.from({ length: 100 }), () => nextUlid),
            );

            expect(
              cursors.every(
                (cursor, index) => index === 0 || cursor > cursors[index - 1]!,
              ),
              'Every cursor in the same burst sorts after its predecessor.',
            ).toBe(true);
          }),
      );

      laymosTest(
        'Exposes the time embedded in a generated cursor.',
        {
          description:
            'The generated ULID should encode a timestamp within the observable bounds around generation.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const before = Date.now();

            const cursor = yield* trace(nextUlid);

            const after = Date.now();
            const timestamp = uTime(cursor);
            expect(
              timestamp !== null && timestamp >= before && timestamp <= after,
              'The cursor timestamp falls within the generation interval.',
            ).toBe(true);
          }),
      );

      laymosTest(
        'Reads ISO cursors and treats an unknown format as having no time.',
        {
          description:
            'Cursor ordering may come from a backend that stamps ISO timestamps. Valid ISO input should parse normally, while an unrelated opaque string has no recoverable time.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const result = yield* trace(
              Effect.sync(() => ({
                iso: uTime('2026-07-24T10:00:00.000Z'),
                invalid: uTime('not-a-time'),
              })),
            );

            expect(
              result.iso,
              'An ISO cursor exposes its millisecond timestamp.',
            ).toBe(Date.parse('2026-07-24T10:00:00.000Z'));
            expect(
              result.invalid,
              'An unrecognized cursor format has no timestamp.',
            ).toBeNull();
          }),
      );

      laymosTest(
        'Uses an explicitly provided deterministic cursor generator.',
        {
          description:
            'Tests may need stable change markers. Replacing the Ulid service should affect the public generator without changing application code.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const cursor = yield* trace(
              nextUlid.pipe(
                Effect.provideService(Ulid, () => 'deterministic-cursor'),
              ),
            );

            expect(
              cursor,
              'The update cursor comes from the provided generator.',
            ).toBe('deterministic-cursor');
          }),
      );
    },
  );
});
