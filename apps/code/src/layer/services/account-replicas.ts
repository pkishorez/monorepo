import { Context, Effect, Layer } from 'effect';
import { Ai } from '@kestack/ai-toolkit/client';
import { Accounts } from '@kestack/auth-toolkit/client';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { ReplicaError, Store } from '@kestack/std-toolkit/replica';
import { Store as IdbStore } from '@kestack/std-toolkit/replica/idb';
import { Store as MemoryStore } from '@kestack/std-toolkit/replica/memory';
import { AccountReplicas } from '../capabilities/index.ts';

/*
 * One Replica Store per Account, each made the first time it is asked for,
 * and `Store` the active Account's: an Account's records are kept under
 * `replica:<accountId>:`, so pruning one Account's never touches another's.
 *
 * 1. Store     the active Account's, or the one being confirmed while the
 *              Accounts are checked, read at each call. Only what is drawn
 *              while an Account is signed in opens an Instance; one opened
 *              just as the Account switches lands in the next Account's
 *              Store, which reads nothing of the last one's, since Machine
 *              ids are never shared between Accounts, and is pruned away.
 * 2. Machines  an Account's Store pruned to its Machines: those gone, and
 *              Replicas no longer read, are deleted, in every tab. One
 *              Machine dropped: its records alone.
 * 3. Accounts  kept: every other Account with records here has its Store
 *              emptied, as Store prune does, so a tab still reading one
 *              stops first; then every database left under `replica:` not
 *              of an Account kept, the records from before they were kept
 *              per Account, is deleted.
 */

type StoreShape = Store['Service'];

const PREFIX = 'replica:';

const warn = (what: string) => (error: unknown) =>
  Effect.logWarning(`[code] could not ${what}`, error);

/** The Accounts with records in this browser, by the segment after `replica:`. */
const storedInIdb = Effect.tryPromise({
  try: () => indexedDB.databases(),
  catch: (cause) => cause,
}).pipe(
  Effect.map((databases) => [
    ...new Set(
      databases.flatMap(({ name }) => {
        if (name === undefined || !name.startsWith(PREFIX)) return [];
        const rest = name.slice(PREFIX.length);
        const at = rest.indexOf(':');
        return at === -1 ? [] : [rest.slice(0, at)];
      }),
    ),
  ]),
);

const make = (
  storeLayerOf: (accountId: string) => Layer.Layer<Store>,
  stored: Effect.Effect<ReadonlyArray<string>, unknown>,
  pruneOthers: (keep: ReadonlyArray<string>) => Effect.Effect<unknown, unknown>,
) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const accounts = yield* Accounts;
      // Made at once, so two asking together share one Store.
      const stores = new Map<string, Layer.Layer<Store>>();
      const storeOf = (accountId: string) =>
        Effect.suspend(() => {
          let made = stores.get(accountId);
          if (made === undefined) {
            made = storeLayerOf(accountId);
            stores.set(accountId, made);
          }
          return Effect.provide(Effect.service(Store), made);
        });

      // 1. Store
      const active = Effect.flatMap(accounts.current, (state) => {
        const id =
          state._tag === 'SignedIn'
            ? state.active.id
            : state._tag === 'Checking'
              ? state.last?.id
              : undefined;
        return id === undefined
          ? Effect.fail(
              new ReplicaError({ message: 'No Account is signed in' }),
            )
          : storeOf(id);
      });

      const store: StoreShape = {
        open: (name) =>
          Effect.flatMap(Effect.orDie(active), (each) => each.open(name)),
        list: Effect.flatMap(active, (each) => each.list),
        remove: (replica, ...key) =>
          Effect.flatMap(active, (each) => each.remove(replica, ...key)),
        prune: (keep) => Effect.flatMap(active, (each) => each.prune(keep)),
      };

      // 3. Accounts: each emptied on its own, so one that fails keeps no other.
      const empty = (accountIds: ReadonlyArray<string>) =>
        Effect.forEach(
          accountIds,
          (accountId) =>
            Effect.flatMap(storeOf(accountId), (each) => each.prune([])).pipe(
              Effect.andThen(Effect.sync(() => stores.delete(accountId))),
              Effect.catch(warn(`delete the records of Account ${accountId}`)),
            ),
          { discard: true },
        );

      return Context.make(Store, store).pipe(
        Context.add(AccountReplicas, {
          // 2. Machines
          keepMachines: (accountId, machineIds) =>
            Effect.flatMap(storeOf(accountId), (each) =>
              each.prune([[Ai, machineIds]]),
            ).pipe(
              Effect.catch(warn(`prune the records of Account ${accountId}`)),
              Effect.asVoid,
            ),
          dropMachine: (accountId, machineId) =>
            Effect.flatMap(storeOf(accountId), (each) =>
              each.remove(Ai, machineId),
            ).pipe(
              Effect.catch(warn(`delete the records of Machine ${machineId}`)),
            ),
          // 3. Accounts
          keepAccounts: (accountIds) =>
            Effect.flatMap(stored, (found) =>
              empty(
                [...new Set([...stores.keys(), ...found])].filter(
                  (id) => !accountIds.includes(id),
                ),
              ),
            ).pipe(
              Effect.andThen(pruneOthers(accountIds)),
              Effect.catch(warn('delete the records of Accounts signed out')),
              Effect.asVoid,
            ),
        }),
      );
    }),
  );

/** Each Account's records in this browser's IndexedDB. */
export const idb = make(
  (accountId) => IdbStore.idb({ prefix: `${PREFIX}${accountId}:` }),
  storedInIdb,
  (keep) => IDB.prune({ prefix: PREFIX, keep }),
);

/** Each Account's records in memory, for a test. */
export const memory = () =>
  make(
    () => MemoryStore.memory(),
    Effect.succeed([]),
    () => Effect.void,
  );
