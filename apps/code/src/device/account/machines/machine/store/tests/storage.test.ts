import 'fake-indexeddb/auto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { Storage } from '../../../../store/index.ts';
import { device } from '../../../../../store.ts';
import { account, accounts } from '../../../../store/index.ts';
import { machine, machines } from '../../../store.ts';
import { sync } from '../index.ts';

const names = { device, accounts, account, machines, machine, sync };
import { storageIdb } from '../index.ts';

/*
 * Storage in IndexedDB: pruning the Accounts deletes every database of an
 * Account not kept, its Machines' and their sync too, and nothing of an
 * Account kept nor of the device; pruning an Account's Machines deletes
 * every one not listed, and all under it, and nothing of the Account
 * itself nor of another Account; a Machine forgotten goes alone.
 */

const create = (name: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });

const databases = async () =>
  (await indexedDB.databases())
    .flatMap(({ name }) => (name === undefined ? [] : [name]))
    .sort();

const run = (effect: (storage: Storage['Service']) => Effect.Effect<void>) =>
  Effect.runPromise(
    Effect.flatMap(Storage, effect).pipe(Effect.provide(storageIdb)),
  );

const pruneAccounts = (signedIn: ReadonlyArray<string>) =>
  run((storage) => storage.pruneAccounts(signedIn));

/** Deletes every database, so each test starts with none. */
const clear = async () => {
  for (const name of await databases())
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
    });
};

describe('Storage', () => {
  it('deletes every Account not signed in, and all under it', async () => {
    const kept = [
      names.device,
      names.account('a1'),
      names.machine('a1', 'm1'),
      `${names.sync('a1', 'm1')}code-m1`,
    ];
    for (const name of [
      ...kept,
      names.account('a2'),
      names.machine('a2', 'm2'),
      `${names.sync('a2', 'm2')}code-m2`,
    ])
      await create(name);

    await pruneAccounts(['a1']);
    expect(await databases()).toEqual([...kept].sort());

    await pruneAccounts([]);
    expect(await databases()).toEqual([names.device]);
  });

  it('deletes the Machines an Account no longer lists, and no Account', async () => {
    await clear();
    const kept = [
      names.device,
      names.account('a1'),
      names.machine('a1', 'm1'),
      `${names.sync('a1', 'm1')}code-m1`,
      // Another Account's Machine of the same id, and one not listed.
      names.machine('a2', 'm2'),
    ];
    for (const name of [
      ...kept,
      names.machine('a1', 'm2'),
      `${names.sync('a1', 'm2')}code-m2`,
      names.machine('a1', 'm10'),
    ])
      await create(name);

    await run((storage) => storage.pruneMachines('a1', ['m1']));
    expect(await databases()).toEqual([...kept].sort());

    await run((storage) => storage.pruneMachines('a1', []));
    expect(await databases()).toEqual(
      [names.device, names.account('a1'), names.machine('a2', 'm2')].sort(),
    );
  });

  it('deletes a Machine forgotten and all under it, and no other', async () => {
    await clear();
    const kept = [
      names.account('a1'),
      names.machine('a1', 'm10'),
      `${names.sync('a1', 'm10')}code-m10`,
      names.machine('a2', 'm1'),
    ];
    for (const name of [
      ...kept,
      names.machine('a1', 'm1'),
      `${names.sync('a1', 'm1')}code-m1`,
    ])
      await create(name);

    await run((storage) => storage.dropMachine('a1', 'm1'));
    expect(await databases()).toEqual([...kept].sort());
  });
});
