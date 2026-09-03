import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { Memory } from '../../../../db/memory/index.js';
import {
  actionHandlerName,
  collectionHandlerName,
  collectionName,
  stdSyncName,
} from '../../../domain/identity/index.js';
import { syncStore } from '../../../domain/stored-entity/index.js';
import { makeSyncStore } from '../../../platform/sync-store/index.js';
import { makeEntryStore } from '../entries.js';
import { queueKey, type PendingEntry } from '../entry.js';

const todos = collectionHandlerName(
  collectionName(stdSyncName('test'), 'todos'),
);

const harness = () => {
  const store = makeEntryStore({
    store: makeSyncStore(Memory.make(syncStore).layer),
    syncName: 'test',
  });
  let seq = 0;
  const entry = (key: string, id?: string): PendingEntry => {
    const at = String(++seq).padStart(4, '0');
    return {
      id: id ?? `e${at}`,
      name: todos,
      queue: queueKey(todos, key),
      enqueuedAt: at,
      body: {
        kind: 'entity',
        op: 'insert',
        key,
        base: null,
        after: {},
        changed: [],
      },
    };
  };
  return { store, entry };
};

describe('outbox entries', () => {
  it('commits a batch as one transaction or not at all', async () => {
    const h = harness();
    const first = h.entry('a');
    await Effect.runPromise(h.store.enqueue([first]));
    const fresh = h.entry('b');
    const duplicate = h.entry('c', first.id);
    await expect(
      Effect.runPromise(h.store.enqueue([fresh, duplicate])),
    ).rejects.toBeDefined();
    expect(await Effect.runPromise(h.store.byId(fresh.id))).toBeNull();
    expect(await Effect.runPromise(h.store.list())).toHaveLength(1);
  });

  it('pages every scan past the first page', async () => {
    const h = harness();
    const shared = 'same';
    for (let batch = 0; batch < 3; batch += 1) {
      await Effect.runPromise(
        h.store.enqueue(Array.from({ length: 50 }, () => h.entry(shared))),
      );
    }
    await Effect.runPromise(
      h.store.enqueue([
        {
          ...h.entry('x'),
          name: actionHandlerName('archive'),
          queue: queueKey(actionHandlerName('archive'), ''),
          body: { kind: 'action', payload: null },
        },
      ]),
    );
    const all = await Effect.runPromise(h.store.list());
    expect(all).toHaveLength(151);
    expect(all.map((entry) => entry.enqueuedAt)).toEqual(
      all.map((entry) => entry.enqueuedAt).sort(),
    );
    const queued = await Effect.runPromise(
      h.store.queue(queueKey(todos, shared)),
    );
    expect(queued).toHaveLength(150);
    await Effect.runPromise(
      h.store.setStatus(
        all.slice(0, 120).map((entry) => entry.id),
        'in-flight',
      ),
    );
    await Effect.runPromise(h.store.resetInFlight());
    const statuses = (await Effect.runPromise(h.store.list())).map(
      (entry) => entry.status,
    );
    expect(new Set(statuses)).toEqual(new Set(['pending']));
  });
});
