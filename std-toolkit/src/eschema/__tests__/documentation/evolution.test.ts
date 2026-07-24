import { Effect, Schema } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import { EntityESchema } from '../../index.js';
import { capabilityDocumentation } from './documentation.js';

const userSchema = EntityESchema.make('User', 'userId', {
  name: Schema.String,
})
  .evolve('v2', { email: Schema.String }, (user) => ({
    ...user,
    email: 'unknown@example.com',
  }))
  .evolve(
    'v3',
    { name: null, displayName: Schema.String, active: Schema.Boolean },
    (user) => ({
      userId: user.userId,
      displayName: user.name,
      email: user.email,
      active: true,
    }),
  )
  .build();

describe('ESchema', () => {
  laymosDescribe(
    'Evolution',
    {
      description:
        'Evolution lets one schema read every historical shape while exposing one current shape to callers.',
      documentation: capabilityDocumentation(
        'An evolving schema is a history of data shapes, not a mutable validator. Each version records the shape that was written at that point in time, and each migration explains how to move one version forward. Callers always receive the latest decoded shape.',
        'The useful mental model is a one-way staircase. Stored data declares which step it occupies through `_v`; decoding walks upward one migration at a time. Encoding never walks backward and always writes the latest step. Fresh data therefore starts at the top, while old data keeps its original meaning because the earlier steps remain frozen.',
        `
const User = EntityESchema.make('User', 'userId', {
  name: Schema.String,
})
  .evolve('v2', { email: Schema.String }, user => ({
    ...user,
    email: 'unknown@example.com',
  }))
  .build()

const current = yield* User.decode(storedUser)
const persisted = yield* User.encode(current)
        `,
        'A missing version is treated as `v1` so an existing unversioned shape can be adopted. A known current version is validated without replaying migrations. Unknown versions and values that do not match their declared historical shape fail rather than being guessed into a new meaning.',
      ),
    },
    () => {
      laymosTest(
        'Creates fresh data directly in the latest version.',
        {
          description:
            'A newly created user has no historical shape to preserve. Encoding should require the current fields and stamp the latest version, so new writes never begin at an obsolete step.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const input = {
              userId: 'user-new',
              displayName: 'Ada',
              email: 'ada@example.com',
              active: true,
            };

            const encoded = yield* trace(userSchema.encode(input));

            expect(
              encoded,
              'Fresh users are persisted in the current v3 shape.',
            ).toEqual({ _v: 'v3', ...input });
          }),
      );

      laymosTest(
        'Reads current data without replacing values through migrations.',
        {
          description:
            'The stored user already declares the latest version. Its current values must be validated as written; migration defaults are only for older versions and must not overwrite present data.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const stored = {
              _v: 'v3',
              userId: 'user-current',
              displayName: 'Grace',
              email: 'grace@example.com',
              active: false,
            };

            const decoded = yield* trace(userSchema.decode(stored));

            expect(
              decoded,
              'Current users retain every value already stored in v3.',
            ).toEqual({
              userId: 'user-current',
              displayName: 'Grace',
              email: 'grace@example.com',
              active: false,
            });
          }),
      );

      laymosTest(
        'Migrates the earliest version through every later version.',
        {
          description:
            'This user was written when only a name existed. Decoding must first add the v2 email default, then apply the v3 rename and active default, proving that migrations compose in chronological order.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const stored = {
              _v: 'v1',
              userId: 'user-old',
              name: 'Lin',
            };

            const decoded = yield* trace(userSchema.decode(stored));

            expect(
              decoded,
              'The v1 user reaches the complete v3 shape through both migrations.',
            ).toEqual({
              userId: 'user-old',
              displayName: 'Lin',
              email: 'unknown@example.com',
              active: true,
            });
          }),
      );

      laymosTest(
        'Starts migration from the version declared by stored data.',
        {
          description:
            'A v2 user has already passed the first migration and may contain a real email. Decoding should run only the v3 migration so that the historical value is preserved.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const stored = {
              _v: 'v2',
              userId: 'user-v2',
              name: 'Margaret',
              email: 'margaret@example.com',
            };

            const decoded = yield* trace(userSchema.decode(stored));

            expect(
              decoded,
              'The v2 email survives while the remaining v3 changes are applied.',
            ).toEqual({
              userId: 'user-v2',
              displayName: 'Margaret',
              email: 'margaret@example.com',
              active: true,
            });
          }),
      );

      laymosTest(
        'Adopts unstamped historical data as the first version.',
        {
          description:
            'A system may introduce ESchema after records already exist. When an unstamped record matches the original shape, it should enter at v1 and climb the same migration staircase as an explicitly stamped v1 record.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const stored = {
              userId: 'user-adopted',
              name: 'Barbara',
            };

            const decoded = yield* trace(userSchema.decode(stored));

            expect(
              decoded,
              'Unstamped legacy data is adopted at v1 and exposed as v3.',
            ).toEqual({
              userId: 'user-adopted',
              displayName: 'Barbara',
              email: 'unknown@example.com',
              active: true,
            });
          }),
      );

      laymosTest(
        'Rejects unstamped data that does not match the first version.',
        {
          description:
            'Missing `_v` is an adoption rule, not permission to accept arbitrary input. An unstamped record with an invalid v1 field must fail before any migration runs.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const failure = yield* trace(
              userSchema
                .decode({ userId: 'user-invalid', name: 42 })
                .pipe(Effect.flip),
            );

            expect(
              failure._tag,
              'Invalid adopted data reports the public ESchema failure type.',
            ).toBe('ESchemaError');
            expect(
              failure.message,
              'The failure identifies decoding as the rejected boundary.',
            ).toBe('Decode failed');
          }),
      );

      laymosTest(
        'Rejects a version that is outside the known history.',
        {
          description:
            'A future or misspelled version cannot be interpreted safely because this schema has no corresponding shape or migration path. The decoder should report that version explicitly.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const failure = yield* trace(
              userSchema
                .decode({
                  _v: 'v99',
                  userId: 'user-future',
                  displayName: 'Future',
                  email: 'future@example.com',
                  active: true,
                })
                .pipe(Effect.flip),
            );

            expect(
              failure._tag,
              'Unknown history reports the public ESchema failure type.',
            ).toBe('ESchemaError');
            expect(
              failure.message,
              'The failure names the unsupported stored version.',
            ).toBe('Unknown schema version: v99');
          }),
      );
    },
  );
});
