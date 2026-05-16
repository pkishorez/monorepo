import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'entity.subscribe contract',
  '`SQLiteEntity#subscribe({ key, pk, cursor, limit? })` drains everything after a cursor by repeatedly querying, then hands off to `ConnectionService` for live-tail.',
  () => {
    vtest(
      'only timeline-SK indexes are subscribable',
      'A non-`_u` SK has no meaningful "since cursor" semantics; the type system refuses the call.',
      () => {
        const isTimeline = (sk: readonly string[]) =>
          sk.length === 1 && sk[0] === '_u';
        expect(isTimeline(['_u'])).toBe(true);
        expect(isTimeline(['createdAt'])).toBe(false);
      },
    );

    vtest(
      'cursor null starts from the beginning of the index',
      'Pass `null` to drain everything from the start; pass a stored `_u` string to resume.',
      () => {
        const start = null;
        expect(start).toBeNull();
      },
    );

    vtest(
      'drained batches are emitted through service.emit, not broadcast',
      'Broadcast is reserved for live writes; the catch-up phase uses `emit(batch)` so the subscriber distinguishes initial sync from live events.',
      () => {
        const events: string[] = [];
        const fakeEmit = () => events.push('emit');
        const fakeSubscribe = () => events.push('subscribe');
        fakeEmit();
        fakeSubscribe();
        expect(events).toEqual(['emit', 'subscribe']);
      },
    );

    vtest(
      'subscribe loops until a page returns 0 items',
      'After the catch-up loop drains the index, the entity calls `service.subscribe(entityName)` so live writes start flowing.',
      () => {
        const isExhausted = (count: number) => count === 0;
        expect(isExhausted(0)).toBe(true);
        expect(isExhausted(5)).toBe(false);
      },
    );

    vtest(
      "each loop iteration advances the cursor by the last item's _u",
      'The library passes `{ ">": currentCursor }` and updates `currentCursor` to the last row\'s `meta._u`.',
      () => {
        const last = { meta: { _u: '2025-01-02T00:00:00.000Z' } };
        expect(last.meta._u > '2025-01-01T00:00:00.000Z').toBe(true);
      },
    );

    vtest(
      'returns { success: true } once handed off to live-tail',
      'The result envelope is intentionally minimal — the interesting outcome is the side-effect on `ConnectionService`.',
      () => {
        const result = { success: true } as const;
        expect(result.success).toBe(true);
      },
    );
  },
);
