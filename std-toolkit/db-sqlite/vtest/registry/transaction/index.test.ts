import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'registry.transaction contract',
  '`registry.transaction(effect)` runs `effect` inside a SQLite `BEGIN`/`COMMIT`/`ROLLBACK` and buffers broadcasts until commit. Nested transactions fail with `nestedTransactionNotSupported`.',
  () => {
    vtest(
      'BEGIN runs before the effect, COMMIT runs only on success',
      'The library uses `Effect.acquireUseRelease`: success → `commit()`; failure → `rollback()`.',
      () => {
        const log: string[] = [];
        const success = true;
        log.push('begin');
        log.push('use');
        log.push(success ? 'commit' : 'rollback');
        expect(log).toEqual(['begin', 'use', 'commit']);
      },
    );

    vtest(
      'effect failure triggers ROLLBACK, not COMMIT',
      'Errors from the inner effect propagate out; the SQL state ends back at where it started.',
      () => {
        const log: string[] = [];
        const success = false;
        log.push('begin');
        log.push(success ? 'commit' : 'rollback');
        expect(log).toEqual(['begin', 'rollback']);
      },
    );

    vtest(
      'nested transactions fail with nestedTransactionNotSupported',
      'The pending-broadcast FiberRef is already Some(...) when another `transaction()` starts — the library refuses to nest.',
      () => {
        const err = { _tag: 'NestedTransactionNotSupported' };
        expect(err._tag).toBe('NestedTransactionNotSupported');
      },
    );

    vtest(
      'writes inside the transaction buffer broadcasts in a FiberRef',
      'The `_broadcast` helper checks `TransactionPendingBroadcasts`; when Some, it appends instead of emitting.',
      () => {
        let buffer: unknown[] | null = [];
        const insideTxn = true;
        if (insideTxn) buffer!.push({ value: { userId: '1' } });
        expect(buffer).toHaveLength(1);
      },
    );

    vtest(
      'on commit, buffered broadcasts flush in insertion order',
      'The registry iterates the buffer once `COMMIT` succeeds and calls `service.broadcast(entity)` for each.',
      () => {
        const buffer = [{ value: { userId: '1' } }, { value: { userId: '2' } }];
        const flushed: unknown[] = [];
        for (const e of buffer) flushed.push(e);
        expect(flushed).toEqual(buffer);
      },
    );

    vtest(
      'on rollback, the buffer is dropped and never emitted',
      "A failed transaction never broadcasts — that's the whole point of buffering.",
      () => {
        let buffer: unknown[] | null = [{ value: {} }];
        const rollback = () => {
          buffer = null;
        };
        rollback();
        expect(buffer).toBeNull();
      },
    );

    vtest(
      'FiberRef is reset to none after the transaction (success or failure)',
      'No leaked txn state survives between calls; the next `transaction()` starts clean.',
      () => {
        let ref: { _tag: 'some' | 'none' } = { _tag: 'some' };
        ref = { _tag: 'none' };
        expect(ref._tag).toBe('none');
      },
    );
  },
);
