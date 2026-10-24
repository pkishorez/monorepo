import 'fake-indexeddb/auto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { IDB } from '../index.js';

const create = (name: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });

const names = async () =>
  (await indexedDB.databases()).flatMap(({ name }) =>
    name === undefined ? [] : [name],
  );

describe('IDB.prune', () => {
  it('deletes what is under the prefix and not kept, and nothing else', async () => {
    for (const name of [
      'replica:a:ai·m1',
      'replica:a:ai·m2',
      'replica:b:ai·m3',
      'replica:ai·m4',
      'code:device',
    ])
      await create(name);

    const pruned = await Effect.runPromise(
      IDB.prune({ prefix: 'replica:', keep: ['a'] }),
    );

    expect([...pruned].sort()).toEqual(['replica:ai·m4', 'replica:b:ai·m3']);
    expect((await names()).sort()).toEqual([
      'code:device',
      'replica:a:ai·m1',
      'replica:a:ai·m2',
    ]);

    await Effect.runPromise(
      IDB.prune({ prefix: 'replica:a:', keep: ['ai·m2'] }),
    );
    expect((await names()).sort()).toEqual(['code:device', 'replica:a:ai·m2']);
  });

  it('refuses an empty prefix', async () => {
    await create('anything');
    const exit = await Effect.runPromiseExit(
      IDB.prune({ prefix: '', keep: [] }),
    );
    expect(exit._tag).toBe('Failure');
    expect(await names()).toContain('anything');
  });
});
