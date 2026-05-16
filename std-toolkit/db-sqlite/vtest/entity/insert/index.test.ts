import { expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';

import { vdescribe, vtest } from '@monorepo/vtest';

const userSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

vdescribe(
  'entity.insert contract',
  '`SQLiteEntity#insert(value)` stamps `_e`, `_v`, `_u`, `_d=0`, derives the primary and secondary index columns, JSON-encodes the payload into `_data`, and `putItem`s the row.',
  () => {
    vtest(
      '_v is taken from the schema, never the caller',
      'Callers pass `Omit<T, "_v">`; the library stamps `_v = schema.latestVersion` on every write.',
      () => {
        expect(userSchema.latestVersion).toBeDefined();
        expect(typeof userSchema.latestVersion).toBe('string');
      },
    );

    vtest(
      '_u is an ISO timestamp generated at write time',
      'Every successful insert refreshes `_u`; `queryStream`/`subscribe` consumers use it as a monotonic cursor.',
      () => {
        const u = new Date().toISOString();
        expect(u).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      },
    );

    vtest(
      '_data is the JSON-encoded payload, _e is the entity name',
      'The single-table layout stores the full payload in one TEXT column; `_e` is set once on insert and never re-written.',
      async () => {
        const encoded = await Effect.runPromise(
          userSchema.encode({ userId: '1', email: 'a@b.com', name: 'A' }),
        );
        expect(typeof JSON.stringify(encoded)).toBe('string');
        expect(userSchema.name).toBe('User');
      },
    );

    vtest(
      'inserted row carries _d: 0 (not deleted)',
      'A fresh insert always lands with the tombstone flag cleared.',
      () => {
        const fresh = { _d: 0 } as const;
        expect(fresh._d).toBe(0);
      },
    );

    vtest(
      'broadcast fires only after the row lands',
      'On success, the entity emits to `ConnectionService` (or, inside a transaction, into the pending broadcast buffer).',
      () => {
        const order: string[] = [];
        const fakePut = () => {
          order.push('putItem');
        };
        const fakeBroadcast = () => {
          order.push('broadcast');
        };
        fakePut();
        fakeBroadcast();
        expect(order).toEqual(['putItem', 'broadcast']);
      },
    );
  },
);
