import { Effect, Schema } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import { EntityESchema } from '../../index.js';
import { capabilityDocumentation } from './documentation.js';

const userSchema = EntityESchema.make('ValidatedUser', 'userId', {
  name: Schema.String,
})
  .evolve('v2', { email: Schema.String }, (user) => ({
    ...user,
    email: 'unknown@example.com',
  }))
  .build();

describe('ESchema', () => {
  laymosDescribe(
    'Standard Schema',
    {
      description:
        'Every ESchema can validate and migrate through the ecosystem-wide Standard Schema interface.',
      documentation: capabilityDocumentation(
        'Standard Schema is a small common interface understood by form libraries, routers, RPC tools, and other validators. ESchema implements that interface directly, so integrations do not need an adapter or knowledge of Effect.',
        'Standard validation follows the same read path as `decode`: it recognizes the stored version, validates that historical shape, runs migrations, and returns the latest decoded value. Success is `{ value }`; failure is `{ issues }`. This means an integration sees the same current domain model as a direct ESchema caller rather than merely checking the old wire shape.',
        `
const result = UserSchema['~standard'].validate(input)

if ('value' in result) {
  useCurrentUser(result.value)
} else {
  showIssues(result.issues)
}
        `,
        'The interface identifies itself as Standard Schema v1 with vendor `std-toolkit/eschema`. Unstamped object data follows ESchema adoption and begins at schema v1. Unknown schema versions and invalid historical fields become issues; the validator does not throw them at the integration boundary.',
      ),
    },
    () => {
      laymosTest(
        'Returns the latest value for input already at the current version.',
        {
          description:
            'A form submits a complete v2 user. Standard validation should remove wire metadata and return the current domain value.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const input = {
              _v: 'v2',
              userId: 'user-current',
              name: 'Ada',
              email: 'ada@example.com',
            };

            const result = yield* trace(
              Effect.sync(() => userSchema['~standard'].validate(input)),
            );

            expect(
              result,
              'Standard Schema returns the decoded current user.',
            ).toEqual({
              value: {
                userId: 'user-current',
                name: 'Ada',
                email: 'ada@example.com',
              },
            });
          }),
      );

      laymosTest(
        'Migrates historical input before returning Standard Schema success.',
        {
          description:
            'An integration receives a stored v1 user. Validation should prove the old shape and then return the same migrated v2 value that direct decode would expose.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const result = yield* trace(
              Effect.sync(() =>
                userSchema['~standard'].validate({
                  _v: 'v1',
                  userId: 'user-old',
                  name: 'Grace',
                }),
              ),
            );

            expect(
              result,
              'Standard Schema success contains the migrated current user.',
            ).toEqual({
              value: {
                userId: 'user-old',
                name: 'Grace',
                email: 'unknown@example.com',
              },
            });
          }),
      );

      laymosTest(
        'Adopts an unstamped object through the first schema version.',
        {
          description:
            'The caller supplies data from before ESchema adoption. Because it matches v1, Standard validation should run the normal adoption and migration path.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const result = yield* trace(
              Effect.sync(() =>
                userSchema['~standard'].validate({
                  userId: 'user-adopted',
                  name: 'Lin',
                }),
              ),
            );

            expect(
              result,
              'Unstamped Standard Schema input reaches the current user shape.',
            ).toEqual({
              value: {
                userId: 'user-adopted',
                name: 'Lin',
                email: 'unknown@example.com',
              },
            });
          }),
      );

      laymosTest(
        'Returns issues when input declares an unknown schema version.',
        {
          description:
            'The integration receives v99, which has no known shape or migration path. Standard Schema should return readable issues instead of throwing or guessing.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const result = yield* trace(
              Effect.sync(() =>
                userSchema['~standard'].validate({
                  _v: 'v99',
                  userId: 'user-future',
                  name: 'Future',
                  email: 'future@example.com',
                }),
              ),
            );

            expect(
              'issues' in result,
              'Unknown schema history is represented as Standard Schema issues.',
            ).toBe(true);
            expect(
              'issues' in result
                ? result.issues?.[0]?.message.includes(
                    'Unknown schema version: v99',
                  )
                : false,
              'The first issue explains which schema version is unsupported.',
            ).toBe(true);
          }),
      );

      laymosTest(
        'Returns issues when historical fields fail their declared shape.',
        {
          description:
            'A v1 record has a numeric name even though v1 requires a string. Migration must not run over invalid historical data; the validation result should contain issues.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const result = yield* trace(
              Effect.sync(() =>
                userSchema['~standard'].validate({
                  _v: 'v1',
                  userId: 'user-invalid',
                  name: 42,
                }),
              ),
            );

            expect(
              'issues' in result && (result.issues?.length ?? 0) > 0,
              'Invalid historical fields produce one or more Standard Schema issues.',
            ).toBe(true);
          }),
      );
    },
  );
});
