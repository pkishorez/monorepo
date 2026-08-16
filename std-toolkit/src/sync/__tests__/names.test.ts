import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import { Memory } from '../../db/memory/index.js';
import { createStdSync, syncPersistenceTable } from '../sync.js';
import { storedSourceEntity } from '../persistence/sync-persistence-table/index.js';

const schema = (name: string) =>
  EntityESchema.make(name, 'id', { title: Schema.String }).build();

describe('named sync', () => {
  it('requires a name at the type level', () => {
    // @ts-expect-error a stable Sync name is required
    const missingName = () => createStdSync();
    expect(missingName).toBeTypeOf('function');
  });

  it('rejects a Sync name whose normalized form is empty', () => {
    expect(() => createStdSync({ name: ' --- ' })).toThrow(
      'a name must contain at least one letter or number',
    );
  });

  it('qualifies the TanStack collection namespace', async () => {
    const channelNames: string[] = [];
    const std = createStdSync({
      name: ' Acme Production ',
      notices: {
        channel: (name) => {
          channelNames.push(name);
          return {
            close: () => undefined,
            onmessage: null,
            postMessage: () => undefined,
          };
        },
      },
    });

    expect(std.sync({ schema: schema('Todo Items') }).id).toBe(
      'acme-production.todo-items',
    );
    expect(channelNames).toEqual(['acme-production.todo-items']);

    await std.dispose();
  });

  it('rejects normalized collection name collisions', async () => {
    const std = createStdSync({ name: 'Acme' });
    std.sync({ schema: schema('Crème Brûlée') });

    expect(() => std.sync({ schema: schema('CREME---BRULEE') })).toThrow(
      'collection name "acme.creme-brulee" is already registered',
    );

    await std.dispose();
  });

  it('uses qualified storage namespaces without changing backend entity identity', async () => {
    const persistence = Memory.make(syncPersistenceTable);
    const first = createStdSync({
      name: 'Dataset A',
      persistenceLayer: persistence.layer,
    });
    const second = createStdSync({
      name: 'Dataset B',
      persistenceLayer: persistence.layer,
    });
    const firstCollection = first.sync({ schema: schema('Todo') });
    const secondCollection = second.sync({ schema: schema('Todo') });
    const entity = {
      value: { id: '1', title: 'from A' },
      meta: { _e: 'Todo', _v: 'v1', _u: '1', _d: false },
    } as const;

    await expect(
      Effect.runPromise(firstCollection.utils.writeUpsert(entity)),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        storedSourceEntity
          .get({ collection: 'dataset-a.todo', key: '1' })
          .pipe(Effect.provide(persistence.layer)),
      ),
    ).resolves.not.toBeNull();
    await expect(
      Effect.runPromise(
        storedSourceEntity
          .get({ collection: 'dataset-b.todo', key: '1' })
          .pipe(Effect.provide(persistence.layer)),
      ),
    ).resolves.toBeNull();
    await expect(
      Effect.runPromise(
        secondCollection.utils.writeUpsert({
          ...entity,
          meta: { ...entity.meta, _e: 'dataset-b.todo' },
        }),
      ),
    ).rejects.toMatchObject({
      _tag: 'WrongEntity',
      expected: 'Todo',
    });

    await first.dispose();
    await second.dispose();
  });
});
