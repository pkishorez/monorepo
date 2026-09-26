import 'fake-indexeddb/auto';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { backend, Todo, todo } from '../../../__tests__/support.js';
import type { SyncEvent } from '../../../domain/sync-event/index.js';
import { createStdSync, strategy } from '../../../index.js';
import { browser, deleteStdSync, listStdSyncs } from '../index.js';

describe('the browser Platform', () => {
  it('keeps a Std Sync in IndexedDB across instances', async () => {
    const server = backend([todo('a', 1)]);
    const first = createStdSync({ name: 'Kept', platform: browser() });
    const todos = first.collection(Todo, {
      sync: { global: strategy.oldToNew({ fetch: server.fetch }) },
    });
    await todos.preload();
    await vi.waitFor(() => expect(todos.size).toBe(1));
    await first.dispose();

    const second = createStdSync({ name: 'Kept', platform: browser() });
    const reloaded = second.collection(Todo);
    await reloaded.preload();
    expect(reloaded.get('a')?.title).toBe('a');
    await second.dispose();

    expect(await listStdSyncs()).toContainEqual({
      name: 'kept',
      databaseName: 'std-sync:kept',
    });
  });

  it('deletes a Std Sync, stopping a live one first', async () => {
    const reported: SyncEvent[] = [];
    const live = createStdSync({
      name: 'doomed',
      platform: browser(),
      onEvent: (event) => Effect.sync(() => void reported.push(event)),
    });
    const todos = live.collection(Todo);
    await todos.preload();

    await deleteStdSync('doomed');
    await vi.waitFor(() =>
      expect(reported).toContainEqual({
        _tag: 'PlatformClosed',
        sync: 'doomed',
      }),
    );
    expect(() => live.collection(Todo)).toThrow('is disposed');
    expect((await listStdSyncs()).map((sync) => sync.name)).not.toContain(
      'doomed',
    );
  });
});
