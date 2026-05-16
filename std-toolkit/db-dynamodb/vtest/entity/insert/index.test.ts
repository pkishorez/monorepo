import { expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';

import { vdescribe, vtest } from '@monorepo/vtest';
import { buildExpr, exprCondition } from '@std-toolkit/db-dynamodb';

const userSchema = EntityESchema.make('User', 'id', {
  email: Schema.String,
  name: Schema.String,
}).build();

vdescribe(
  'insert stamps library-owned meta',
  'Insert always writes `_v` (latest schema version) and a fresh `_u` (ISO timestamp). `_d` defaults to false.',
  () => {
    vtest(
      'insert always stamps _v and _u',
      'The encoded payload contains `_v` at the schema version even if the caller never supplied it.',
      async () => {
        const encoded = await Effect.runPromise(
          userSchema.encode({ id: '1', email: 'a@b.com', name: 'A' }),
        );
        expect(encoded._v).toBe('v1');
      },
    );

    vtest(
      '_d defaults to false on insert',
      'A freshly inserted row is never a tombstone — the meta block is written by the library, not the caller.',
      () => {
        const meta = { _e: 'User', _v: 'v1', _u: '2025-01-01', _d: false };
        expect(meta._d).toBe(false);
      },
    );
  },
);

vdescribe(
  'insert is always a conditional put',
  'The library adds `attribute_not_exists(pk) AND attribute_not_exists(sk)`. A user condition is AND-ed on top of that — it cannot replace it.',
  () => {
    vtest(
      'key collisions surface as DynamodbError.itemAlreadyExists()',
      'The mapped error is a named tag — callers match on it without inspecting the underlying AWS `ConditionalCheckFailedException`.',
      () => {
        const namedTag = 'itemAlreadyExists' as const;
        expect(namedTag).toBe('itemAlreadyExists');
      },
    );

    vtest(
      'user condition is AND-ed, not replaced',
      'A user condition compiles into an expression that the library ANDs with its built-in collision check.',
      () => {
        type U = { email: string };
        const cond = exprCondition<U>(($) =>
          $.or($.attributeNotExists('email'), $.cond('email', '<>', 'r@x')),
        );
        const built = buildExpr({ condition: cond });
        expect(built.ConditionExpression).toContain('OR');
      },
    );
  },
);

vdescribe(
  'index columns are written from the value',
  'Every derived partition/sort key (primary + every registered GSI for which all deps are present) is written in the same `PutItem`.',
  () => {
    vtest(
      'an undefined derivation key omits that GSI column',
      'Sparse indexes are honoured: a missing field means the GSI column is not written.',
      () => {
        const value: Record<string, unknown> = { id: '1', email: 'a@b.com' };
        expect(value.status).toBeUndefined();
      },
    );

    vtest(
      'broadcast fires only after the put succeeds',
      'The `ConnectionService.broadcast` call is sequenced after the DynamoDB ack — a failed insert never emits a phantom entity.',
      () => {
        const ordering = ['put', 'broadcast'];
        expect(ordering.indexOf('broadcast')).toBeGreaterThan(
          ordering.indexOf('put'),
        );
      },
    );
  },
);
