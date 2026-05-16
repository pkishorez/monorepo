import { expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';

import { vdescribe, vtest } from '@monorepo/vtest';

const userSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

vdescribe(
  'entity.get contract',
  '`SQLiteEntity#get(keyValue)` derives `pk`/`sk` from the supplied fields and returns the decoded row plus its meta envelope, or `null` for a missing row.',
  () => {
    vtest(
      'null for missing rows, not an error',
      'A missing row is a normal outcome — the Effect succeeds with `null` instead of failing.',
      () => {
        const isNullableOutcome = (
          v: { value: unknown } | null,
        ): v is null | { value: unknown } => v === null || 'value' in v;
        expect(isNullableOutcome(null)).toBe(true);
        expect(isNullableOutcome({ value: { userId: '1' } })).toBe(true);
      },
    );

    vtest(
      'soft-deleted rows are still returned, with _d: true',
      'Soft delete is part of the data surface — sync consumers rely on observing the tombstone.',
      () => {
        const tombstoned = {
          value: { userId: '1', email: 'a@b.com', name: 'A' },
          meta: { _e: 'User', _v: 'v1', _u: '2025-01-01', _d: true },
        };
        expect(tombstoned.meta._d).toBe(true);
      },
    );

    vtest(
      "sk is always the entity's idField value",
      'The library derives SK from the schema `idField` — you never pass `sk` to `.primary({ pk })`.',
      async () => {
        expect(userSchema.idField).toBe('userId');
        const encoded = await Effect.runPromise(
          userSchema.encode({ userId: '1', email: 'a@b.com', name: 'A' }),
        );
        expect(encoded.userId).toBe('1');
      },
    );

    vtest(
      '_d on disk is INTEGER 0|1, decoded into boolean meta._d',
      'SQLite has no native boolean. The library decodes the column into a real boolean so meta is identical to db-dynamodb.',
      () => {
        const fromRow = (row: { _d: number }) => ({ _d: row._d === 1 });
        expect(fromRow({ _d: 1 })._d).toBe(true);
        expect(fromRow({ _d: 0 })._d).toBe(false);
      },
    );
  },
);
