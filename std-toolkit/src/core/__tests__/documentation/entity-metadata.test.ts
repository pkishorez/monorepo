import { Effect, Schema } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import { MetaSchema } from '../../index.js';

describe('Core', () => {
  laymosDescribe(
    'Entity metadata',
    {
      description:
        'Entity metadata carries type, schema version, convergence order, deletion state, and optional delivery timing beside a domain value.',
      documentation: `
Domain fields live in an entity's \`value\`; cross-cutting storage and sync facts
live in \`meta\`. Keeping the two separate means a domain is free to use names
that make sense to it while every adapter agrees on one transport contract.

\`_e\` is the owning entity type. \`_v\` tells ESchema how to decode the value.
\`_u\` orders changes. \`_d\` makes deletion a convergent tombstone. Optional
\`_s\` and \`_c\` describe server and client delivery timing for cadence repair;
ordinary adapters do not need to invent them.

\`\`\`ts
const entity = {
  value: { userId: 'user-1', name: 'Ada' },
  meta: { _e: 'User', _v: 'v2', _u: cursor, _d: false },
}
\`\`\`

Metadata validation is strict about the meaning of present fields but tolerant
of the two optional timing fields being absent. Invalid metadata is rejected at
the boundary instead of entering convergence with ambiguous semantics.
      `,
    },
    () => {
      laymosTest(
        'Accepts the portable metadata every adapter supplies.',
        {
          description:
            'A normal persisted entity has type, version, cursor, and deletion state. Delivery timing is optional and should not be added during decoding.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const input = {
              _e: 'User',
              _v: 'v2',
              _u: '01J00000000000000000000000',
              _d: false,
            };

            const decoded = yield* trace(
              Schema.decodeUnknownEffect(MetaSchema)(input),
            );

            expect(
              decoded,
              'Portable entity metadata decodes without synthetic timing fields.',
            ).toEqual(input);
          }),
      );

      laymosTest(
        'Preserves optional delivery timing when a server supplies it.',
        {
          description:
            'Cadence-aware delivery records server and client milliseconds. Both numbers should survive metadata validation unchanged.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const input = {
              _e: 'User',
              _v: 'v2',
              _u: '01J00000000000000000000000',
              _d: false,
              _s: 1_700_000_000_000,
              _c: 1_700_000_000_050,
            };

            const decoded = yield* trace(
              Schema.decodeUnknownEffect(MetaSchema)(input),
            );

            expect(
              decoded,
              'Server and client delivery timestamps remain available to cadence logic.',
            ).toEqual(input);
          }),
      );

      laymosTest(
        'Rejects metadata whose deletion state is not boolean.',
        {
          description:
            'A string deletion flag has ambiguous truthiness and must not enter storage or synchronization. Schema validation should fail at this boundary.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const failure = yield* trace(
              Schema.decodeUnknownEffect(MetaSchema)({
                _e: 'User',
                _v: 'v2',
                _u: '01J00000000000000000000000',
                _d: 'false',
              }).pipe(Effect.flip),
            );

            expect(
              failure._tag,
              'Malformed metadata reports the Effect Schema parse failure.',
            ).toBe('SchemaError');
          }),
      );
    },
  );
});
