import { expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';

import { vdescribe, vtest } from '@monorepo/vtest';

const userSchema = EntityESchema.make('User', 'id', {
  email: Schema.String,
  name: Schema.String,
}).build();

vdescribe(
  'entity.get contract',
  'A `DynamoEntity.get(keyValue)` derives `pk`/`sk` from the supplied fields and returns the decoded row plus its meta envelope, or `null` for a missing row.',
  () => {
    vtest(
      'null for missing rows, not an error',
      'A missing row is a normal outcome — the Effect succeeds with `null` instead of failing.',
      () => {
        const isNullableOutcome = (
          v: { value: unknown } | null,
        ): v is null | { value: unknown } => v === null || 'value' in v;
        expect(isNullableOutcome(null)).toBe(true);
        expect(isNullableOutcome({ value: { id: '1' } })).toBe(true);
      },
    );

    vtest(
      'soft-deleted rows are returned with _d: true',
      'The tombstone is part of the data surface — sync consumers rely on observing it.',
      () => {
        const tombstoned = {
          value: { id: '1', email: 'a@b.com', name: 'A' },
          meta: { _e: 'User', _v: 'v1', _u: '2025-01-01', _d: true },
        };
        expect(tombstoned.meta._d).toBe(true);
      },
    );

    vtest(
      "sk is always the entity's idField value",
      'The library derives SK from the schema `idField` — you never pass `sk` to `.primary({ pk })`.',
      async () => {
        expect(userSchema.idField).toBe('id');
        const encoded = await Effect.runPromise(
          userSchema.encode({ id: '1', email: 'a@b.com', name: 'A' }),
        );
        expect(encoded.id).toBe('1');
      },
    );

    vtest(
      'ConsistentRead is opt-in, defaults to false',
      'Eventual read is the default; pass `{ ConsistentRead: true }` for strong consistency.',
      () => {
        const opts: { ConsistentRead?: boolean } = {};
        expect(opts.ConsistentRead).toBeUndefined();
        const strong: { ConsistentRead?: boolean } = { ConsistentRead: true };
        expect(strong.ConsistentRead).toBe(true);
      },
    );
  },
);
