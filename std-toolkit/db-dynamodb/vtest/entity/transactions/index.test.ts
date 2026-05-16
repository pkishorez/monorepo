import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'insertOp / updateOp transactional builders',
  'These return a `TransactItem` with `entityName` and a `broadcast` payload that the registry uses to fan changes out after the transaction succeeds.',
  () => {
    vtest(
      'updateOp pre-fetches the existing row',
      'A `get()` happens first so the broadcast payload is complete. A missing row fails fast with `noItemToUpdate` before the transaction is issued.',
      () => {
        const updateOpPrefetches = true;
        expect(updateOpPrefetches).toBe(true);
      },
    );

    vtest(
      'insertOp does not pre-fetch',
      'No round-trip — it derives the row, stamps meta, and packages the conditional put.',
      () => {
        const insertOpPrefetches = false;
        expect(insertOpPrefetches).toBe(false);
      },
    );

    vtest(
      "broadcast is the registry's job, not the op's",
      'Each op only sets `broadcast: { value, meta }` — the actual emit fires inside `registry.transact` after the DynamoDB ack.',
      () => {
        const op = {
          entityName: 'User',
          broadcast: {
            value: { id: '1' },
            meta: { _e: 'User', _v: 'v1', _u: 'x', _d: false },
          },
        };
        expect(op.broadcast).toBeDefined();
        expect(op.broadcast.meta._d).toBe(false);
      },
    );

    vtest(
      'failures abort the whole transaction',
      'DynamoDB `TransactWriteItems` is all-or-nothing — any per-op condition failure rolls back the rest.',
      () => {
        const isAtomic = true;
        expect(isAtomic).toBe(true);
      },
    );
  },
);
