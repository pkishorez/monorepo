import 'fake-indexeddb/auto';
import { Effect, Layer } from 'effect';
import { Ai } from '@kestack/ai-toolkit/client';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { Store } from '@kestack/std-toolkit/replica';
import { describe, expect, it } from 'vitest';
import { AccountReplicas } from '../capabilities/index.ts';
import { accountReplicasIdb } from './index.ts';

/*
 * Each Account's records under its own prefix: pruning one Account's to
 * its Machines leaves the others alone, and keeping some Accounts deletes
 * every other's, the records from before they were kept per Account too.
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

const names = async () =>
  (await indexedDB.databases())
    .flatMap(({ name }) => (name === undefined ? [] : [name]))
    .sort();

const account = (id: string) => ({
  id,
  email: `${id}@example.com`,
  name: id,
  image: null,
  test: false,
});

const accounts = Layer.mock(Accounts)({
  current: Effect.succeed(
    AccountsState.SignedIn({
      active: account('a1'),
      accounts: [account('a1'), account('a2')],
    }),
  ),
});

const run = <A>(effect: Effect.Effect<A, unknown, AccountReplicas | Store>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(accountReplicasIdb.pipe(Layer.provide(accounts))),
    ),
  );

describe('Account Replicas', () => {
  it('keeps each Account’s records to itself', async () => {
    const legacy = `replica:${Ai.instanceName('m0')}`;
    for (const name of [
      `replica:a1:${Ai.instanceName('m1')}`,
      `replica:a1:${Ai.instanceName('m2')}`,
      'replica:a1:ai-m1·m1',
      `replica:a2:${Ai.instanceName('m3')}`,
      `replica:a3:${Ai.instanceName('m4')}`,
      legacy,
      'code:device',
    ])
      await create(name);

    await run(
      Effect.flatMap(AccountReplicas, (replicas) =>
        replicas.keepMachines('a1', ['m1']),
      ),
    );
    expect(await names()).toEqual([
      'code:device',
      `replica:a1:${Ai.instanceName('m1')}`,
      `replica:a2:${Ai.instanceName('m3')}`,
      `replica:a3:${Ai.instanceName('m4')}`,
      legacy,
    ]);

    await run(
      Effect.flatMap(AccountReplicas, (replicas) =>
        replicas.keepAccounts(['a1', 'a2']),
      ),
    );
    expect(await names()).toEqual([
      'code:device',
      `replica:a1:${Ai.instanceName('m1')}`,
      `replica:a2:${Ai.instanceName('m3')}`,
    ]);
  });

  it('drops one Machine’s records and no other', async () => {
    await create(`replica:a5:${Ai.instanceName('m5')}`);
    await create(`replica:a5:${Ai.instanceName('m6')}`);
    await run(
      Effect.flatMap(AccountReplicas, (replicas) =>
        replicas.dropMachine('a5', 'm5'),
      ),
    );
    const left = await names();
    expect(left).not.toContain(`replica:a5:${Ai.instanceName('m5')}`);
    expect(left).toContain(`replica:a5:${Ai.instanceName('m6')}`);
  });

  it('gives the active Account’s Store as `Store`', async () => {
    await create(`replica:a1:${Ai.instanceName('m9')}`);
    const listed = await run(Effect.flatMap(Store, (store) => store.list));
    expect(listed).toContainEqual({
      replica: Ai.name,
      key: 'm9',
    });
    expect(listed).not.toContainEqual({ replica: Ai.name, key: 'm3' });
  });
});
