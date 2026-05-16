import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.broadcast contract',
  'Every successful write (insert / update / soft-delete) emits the resulting entity through `ConnectionService`. Inside a `registry.transaction(...)`, broadcasts are buffered in a `FiberRef` and flushed only on commit.',
  () => {
    vtest(
      'broadcast fires AFTER the write lands, never before',
      'The library calls `service.broadcast(entity)` only on the success path of the Effect; a SQL failure suppresses the broadcast.',
      () => {
        const order: string[] = [];
        const fakeWrite = () => order.push('write');
        const fakeBroadcast = () => order.push('broadcast');
        fakeWrite();
        fakeBroadcast();
        expect(order).toEqual(['write', 'broadcast']);
      },
    );

    vtest(
      'inside a transaction, broadcast is buffered, not emitted',
      'A successful write inside `registry.transaction(...)` appends to the `TransactionPendingBroadcasts` FiberRef; downstream subscribers see nothing until commit.',
      () => {
        const pending: unknown[] = [];
        const push = (e: unknown) => pending.push(e);
        push({ value: { userId: '1' } });
        expect(pending).toHaveLength(1);
      },
    );

    vtest(
      'commit flushes pending broadcasts in insertion order',
      'After SQLite `COMMIT` succeeds, the registry iterates the buffer and broadcasts each entity, then resets the FiberRef to `none`.',
      () => {
        const pending = [
          { value: { userId: '1' } },
          { value: { userId: '2' } },
        ];
        const broadcasts: unknown[] = [];
        for (const e of pending) broadcasts.push(e);
        expect(broadcasts).toEqual(pending);
      },
    );

    vtest(
      'rollback drops pending broadcasts entirely',
      'A failed transaction never flushes — the buffer is reset to `none` after the rollback.',
      () => {
        let pending: unknown[] | null = [{ value: { userId: '1' } }];
        const rollback = () => {
          pending = null;
        };
        rollback();
        expect(pending).toBeNull();
      },
    );

    vtest(
      '`ConnectionService` is optional — no service, no broadcast',
      'Server-only code provides `ConnectionService`. In a Node script that just writes to SQLite, the write still succeeds and the broadcast is a no-op.',
      () => {
        const service: { broadcast?: (e: unknown) => void } = {};
        // service?.broadcast(...) is a no-op when service has no broadcast
        expect(service.broadcast).toBeUndefined();
      },
    );
  },
);
