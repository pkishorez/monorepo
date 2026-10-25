import 'fake-indexeddb/auto';
import { Deferred, Effect, Fiber, Layer } from 'effect';
import { CodeReplica } from '@kestack/connect/code';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { Store } from '@kestack/std-toolkit/replica';
import { Store as IdbStore } from '@kestack/std-toolkit/replica/idb';
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
    const legacy = `replica:${CodeReplica.instanceName('m0')}`;
    for (const name of [
      `replica:a1:${CodeReplica.instanceName('m1')}`,
      `replica:a1:${CodeReplica.instanceName('m2')}`,
      'replica:a1:ai-m1·m1',
      `replica:a2:${CodeReplica.instanceName('m3')}`,
      `replica:a3:${CodeReplica.instanceName('m4')}`,
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
      `replica:a1:${CodeReplica.instanceName('m1')}`,
      `replica:a2:${CodeReplica.instanceName('m3')}`,
      `replica:a3:${CodeReplica.instanceName('m4')}`,
      legacy,
    ]);

    await run(
      Effect.flatMap(AccountReplicas, (replicas) =>
        replicas.keepAccounts(['a1', 'a2']),
      ),
    );
    expect(await names()).toEqual([
      'code:device',
      `replica:a1:${CodeReplica.instanceName('m1')}`,
      `replica:a2:${CodeReplica.instanceName('m3')}`,
    ]);
  });

  it('stops another tab still reading an Account it deletes', async () => {
    const name = CodeReplica.instanceName('m7');
    await create(`replica:a7:${name}`);
    await run(
      Effect.gen(function* () {
        const opened = yield* Deferred.make<void>();
        // Another tab, on an Account this one never opened.
        const other = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const space = yield* (yield* Store).open(name);
              yield* Deferred.succeed(opened, undefined);
              yield* space.removed;
            }),
          ).pipe(Effect.provide(IdbStore.idb({ prefix: 'replica:a7:' }))),
        );
        yield* Deferred.await(opened);
        yield* Effect.flatMap(AccountReplicas, (replicas) =>
          replicas.keepAccounts(['a1', 'a2']),
        );
        yield* Fiber.join(other).pipe(Effect.timeout('1 second'));
      }),
    );
    expect(await names()).not.toContain(`replica:a7:${name}`);
  });

  it('drops one Machine’s records and no other', async () => {
    await create(`replica:a5:${CodeReplica.instanceName('m5')}`);
    await create(`replica:a5:${CodeReplica.instanceName('m6')}`);
    await run(
      Effect.flatMap(AccountReplicas, (replicas) =>
        replicas.dropMachine('a5', 'm5'),
      ),
    );
    const left = await names();
    expect(left).not.toContain(`replica:a5:${CodeReplica.instanceName('m5')}`);
    expect(left).toContain(`replica:a5:${CodeReplica.instanceName('m6')}`);
  });

  it('gives the active Account’s Store as `Store`', async () => {
    await create(`replica:a1:${CodeReplica.instanceName('m9')}`);
    const listed = await run(Effect.flatMap(Store, (store) => store.list));
    expect(listed).toContainEqual({
      replica: CodeReplica.name,
      key: 'm9',
    });
    expect(listed).not.toContainEqual({ replica: CodeReplica.name, key: 'm3' });
  });
});
