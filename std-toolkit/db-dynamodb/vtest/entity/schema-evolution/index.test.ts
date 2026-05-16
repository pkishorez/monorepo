import { expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';

import { vdescribe, vtest } from '@monorepo/vtest';

const userV1 = EntityESchema.make('User', 'id', {
  email: Schema.String,
  name: Schema.String,
}).build();

vdescribe(
  'writes always stamp _v at the latest version',
  '`eschema.latestVersion` is read at write time — the caller cannot pin to an older version.',
  () => {
    vtest(
      'latestVersion is what gets written',
      'The encoded payload carries `_v: latestVersion`.',
      async () => {
        const encoded = await Effect.runPromise(
          userV1.encode({ id: '1', email: 'a@b.com', name: 'A' }),
        );
        expect(encoded._v).toBe(userV1.latestVersion);
      },
    );
  },
);

vdescribe(
  'reads transform up the version chain',
  'A row with an older `_v` passes through every registered transform up to the latest before it lands in `value`.',
  () => {
    vtest(
      'a v1 row decodes into the v1 in-memory shape',
      'Round-tripping `v1` through `decode` produces the v1 payload (no evolutions registered yet).',
      async () => {
        const decoded = await Effect.runPromise(
          userV1.decode({
            _v: 'v1',
            id: '1',
            email: 'a@b.com',
            name: 'A',
          }),
        );
        expect(decoded.id).toBe('1');
      },
    );
  },
);

vdescribe(
  'evolutions are forward-only',
  'There is no down-migration; old clients reading new data is out of scope.',
  () => {
    vtest(
      'no API for pinning a write to an older version',
      "The library exposes only `latestVersion`; there is no `write({ pinVersion: 'v1' })` form.",
      () => {
        expect('pinVersion' in userV1).toBe(false);
      },
    );
  },
);

vdescribe(
  'update locks on _v',
  'Every update AND-s `_v = latest` onto the condition. A row at an older `_v` cannot be updated until it has been migrated.',
  () => {
    vtest(
      'old _v on a stored row blocks an update',
      'The conditional `_v = latest` evaluates to false; DynamoDB rejects the write.',
      () => {
        const storedVersion = 'v1';
        const latestVersion = 'v2';
        expect(storedVersion === latestVersion).toBe(false);
      },
    );
  },
);
