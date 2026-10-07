import { describe, expect, it, vi } from 'vitest';
import { fakeExpoDatabase } from '../../../../db/sqlite/__tests__/expo-database.js';
import { backend, Todo, todo } from '../../../__tests__/support.js';
import { createStdSync, strategy } from '../../../index.js';
import { Sync } from '../index.js';

describe('Sync.sqlite', () => {
  it('keeps a Std Sync in SQLite across instances', async () => {
    const database = fakeExpoDatabase();
    const server = backend([todo('a', 1)]);
    const first = createStdSync({
      name: 'Kept',
      store: Sync.sqlite({ database }),
    });
    const todos = first.collection(Todo, {
      sync: { global: strategy.oldToNew({ fetch: server.fetch }) },
    });
    await todos.preload();
    await vi.waitFor(() => expect(todos.size).toBe(1));
    await first.dispose();

    const second = createStdSync({
      name: 'Kept',
      store: Sync.sqlite({ database }),
    });
    const reloaded = second.collection(Todo);
    await reloaded.preload();
    expect(reloaded.get('a')?.title).toBe('a');
    await second.dispose();

    expect(await Sync.sqlite.list(database)).toEqual([
      { name: 'kept', tableName: 'std-sync:kept' },
    ]);
  });

  it('lists and deletes local copies', async () => {
    const database = fakeExpoDatabase();
    for (const name of ['alice', 'bob']) {
      const sync = createStdSync({ name, store: Sync.sqlite({ database }) });
      await sync.collection(Todo).preload();
      await sync.dispose();
    }
    expect((await Sync.sqlite.list(database)).map((sync) => sync.name)).toEqual(
      ['alice', 'bob'],
    );

    await Sync.sqlite.remove(database, 'Alice');
    expect((await Sync.sqlite.list(database)).map((sync) => sync.name)).toEqual(
      ['bob'],
    );
    const indexes = await database.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?",
      ['std-sync:alice'],
    );
    expect(indexes).toEqual([]);
  });
});
