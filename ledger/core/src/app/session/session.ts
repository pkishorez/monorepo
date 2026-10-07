import { Effect } from 'effect';
import { syncName } from '@kstackz/auth-toolkit/app';
import type { OpenAccount } from '@kstackz/auth-toolkit/gate';
import type { Entity } from '@kstackz/std-toolkit/core';
import type { AnyEntityESchema } from '@kstackz/std-toolkit/eschema';
import { createStdSync, inOrder, strategy } from '@kstackz/std-toolkit/sync';
import { Account, Category, Entry, Preferences } from '../../model/index.ts';
import { BackendLink } from '../link/index.ts';
import { makeRpcRuntime, Rpc } from './rpc.ts';
import type { Session } from './types.ts';

// How often a Session asks for what other devices changed.
const POLL = '10 seconds';

type Kind = 'Accounts' | 'Categories' | 'Entries' | 'Preferences';

type Link = BackendLink['Service'];

/** One user's money on this device: a Std Sync named for them, kept in step
 * with the Backend `link` reaches, each call signed with their token. */
const makeSession = (link: Link, account: OpenAccount) => {
  const { user } = account;
  const runtime = makeRpcRuntime(link.api, account.waitForToken);
  const sync = createStdSync({
    // Named for the user, so what it keeps is deleted once they sign out.
    name: syncName(user.id),
    runtime,
    platform: link.syncPlatform,
  });

  // Each kind reads every change after the newest it has, and writes one
  // value at a time; the server answers with what it stored.
  const collectionOf = <S extends AnyEntityESchema>(kind: Kind, schema: S) => {
    type Value = S['Type'];
    // The kind's own RPCs by name: `Entries.Put`. Their types meet here.
    const call = <A>(name: string, payload: object) =>
      Effect.gen(function* () {
        const rpc = (yield* Rpc) as unknown as Record<
          string,
          (payload: object) => Effect.Effect<A, unknown>
        >;
        return yield* rpc[`${kind}.${name}`]!(payload);
      });
    const id = (value: Value) =>
      (value as Record<string, string>)[schema.idField]!;
    // Each row's writes reach the Backend in the order they were made.
    const writeInOrder = inOrder();
    return sync.collection(schema, {
      sync: {
        global: strategy.oldToNew({
          fetch: ({ after }) =>
            call<ReadonlyArray<Entity<Value>>>('Changes', {
              after: after?.meta._u ?? null,
            }),
          pollEvery: POLL,
        }),
      },
      onInsert: (items) =>
        Effect.forEach(items, (value) =>
          writeInOrder(id(value), call<Entity<Value>>('Put', { value })),
        ),
      onUpdate: ({ current, updates }) =>
        writeInOrder(
          id(current),
          call<Entity<Value>>('Put', { value: { ...current, ...updates } }),
        ),
      onDelete: ({ current }) =>
        writeInOrder(
          id(current),
          call<Entity<Value>>('Delete', { id: id(current) }),
        ),
    });
  };

  // A command cut off by the Session ending never answers, rather than
  // failing under whoever opens next.
  const command = <A>(
    run: (rpc: Rpc['Service']) => Effect.Effect<A, unknown>,
  ) =>
    account.whileOpen(
      runtime.runPromise(
        Effect.gen(function* () {
          return yield* run(yield* Rpc);
        }),
      ),
    );

  const session: Session & { readonly dispose: () => Promise<void> } = {
    user,
    userId: user.id,
    accounts: collectionOf('Accounts', Account),
    categories: collectionOf('Categories', Category),
    entries: collectionOf('Entries', Entry),
    preferences: collectionOf('Preferences', Preferences),
    /**
     * Writes the sample Accounts and Categories, and with `entries` three
     * Months of Entries, unless the user has Accounts already.
     */
    sample: (entries: boolean) =>
      command((rpc) => rpc['Ledger.Sample']({ entries })),
    /** Deletes every Account, Category and Entry. */
    clear: () => command((rpc) => rpc['Ledger.Clear']({})),
    dispose: async () => {
      await sync.dispose();
      await runtime.dispose();
    },
  };
  return session;
};

/**
 * Opens `account`'s session over `link` for as long as its scope lasts:
 * the user's Std Sync, kept in step with the Backend, closed with the scope
 * after the writes on their way have landed.
 */
export const openSession = (link: Link, account: OpenAccount) =>
  Effect.acquireRelease(
    Effect.sync(() => makeSession(link, account)),
    (session) => Effect.promise(() => session.dispose()),
  ).pipe(Effect.map((session): Session => session));

/** The Session: what one signed-in user gets, over the link to the Backend
 * Ledger runs on. `createApp` opens it when they become active and closes it
 * when they stop being active. */
export const ledgerSession = (account: OpenAccount) =>
  Effect.gen(function* () {
    return yield* openSession(yield* BackendLink, account);
  });
