import {
  createCollection,
  createLiveQueryCollection,
  eq,
  type SyncConfig,
} from '@tanstack/react-db';
import { expect, it, vi } from 'vitest';

type Row = { id: string; board: string; title: string };

it('replaces a rejected optimistic insert with the server row while another write settles', async () => {
  let sync!: Parameters<SyncConfig<Row, string>['sync']>[0];
  let rejectInsert!: (error: Error) => void;
  let resolveUpdate!: () => void;
  const insertPersistence = new Promise<void>((_, reject) => {
    rejectInsert = reject;
  });
  const updatePersistence = new Promise<void>((resolve) => {
    resolveUpdate = resolve;
  });
  const tasks = createCollection<Row, string>({
    id: 'rollback-regression',
    getKey: (row) => row.id,
    gcTime: 0,
    sync: {
      sync: (callbacks) => {
        sync = callbacks;
        sync.begin();
        sync.write({
          type: 'insert',
          value: { id: 't1', board: 'work', title: 'Plan' },
        });
        sync.commit();
        sync.markReady();
      },
    },
    onInsert: () => insertPersistence,
    onUpdate: () => updatePersistence,
  });
  const screen = createLiveQueryCollection({
    query: (q) =>
      q.from({ task: tasks }).where(({ task }) => eq(task.board, 'work')),
    startSync: true,
    gcTime: 0,
  });

  try {
    await screen.preload();
    const inserted = tasks.insert({ id: 't3', board: 'work', title: 'Local' });
    const updated = tasks.update('t1', (row) => {
      row.title = 'Updated';
    });
    const rejected = expect(inserted.isPersisted.promise).rejects.toThrow(
      'Server refused insert',
    );
    void updated.isPersisted.promise.catch(() => undefined);

    // Server deltas arrive while both optimistic transactions are pending.
    sync.begin();
    sync.write({
      type: 'insert',
      value: { id: 't3', board: 'work', title: 'Server' },
    });
    sync.commit();
    sync.begin();
    sync.write({
      type: 'update',
      value: { id: 't1', board: 'work', title: 'Updated' },
    });
    sync.commit();

    rejectInsert(new Error('Server refused insert'));
    await rejected;
    resolveUpdate();

    // DB 0.8.1–0.8.7 leave the rejected local row in the live query here.
    await vi.waitFor(() => {
      expect(screen.toArray.find((row) => row.id === 't3')).toMatchObject({
        title: 'Server',
        $synced: true,
      });
      expect(screen.toArray.find((row) => row.id === 't1')).toMatchObject({
        title: 'Updated',
        $synced: true,
      });
      expect(screen.size).toBe(2);
    });
    await updated.isPersisted.promise;
  } finally {
    resolveUpdate();
    await screen.cleanup();
    await tasks.cleanup();
  }
});
