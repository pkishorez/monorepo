import { Effect } from 'effect';
import type { Entity } from '@kstackz/std-toolkit/core';
import type { AnyEntityESchema } from '@kstackz/std-toolkit/eschema';
import {
  createStdSync,
  type StdSyncPlatform,
  strategy,
} from '@kstackz/std-toolkit/sync';
import {
  Account,
  Category,
  Entry,
  Preferences,
} from '../../../shared/ledger/index.ts';
import type { Session, User } from '../../domain/session/index.ts';
import { copyName } from '../local-copies/index.ts';
import {
  type Connection,
  type Credential,
  makeRpcRuntime,
  Rpc,
} from './rpc.ts';

// How often the browser asks for what other devices changed.
const POLL = '10 seconds';

type Kind = 'Accounts' | 'Categories' | 'Entries' | 'Preferences';

/** Where a Backend's Sessions reach it, and where their copies live: in
 * memory unless a platform keeps them. */
export type SessionLink = {
  readonly connection: Connection;
  readonly platform?: StdSyncPlatform;
};

/** One User's money on this device, kept in step with the Backend `link`
 * reaches. */
const makeSession = (link: SessionLink, user: User, token: string | null) => {
  const credential: Credential = { token };
  const runtime = makeRpcRuntime(link.connection, credential);
  const sync = createStdSync({
    name: copyName(user.id),
    runtime,
    ...(link.platform === undefined ? {} : { platform: link.platform }),
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
        Effect.forEach(items, (value) => call<Entity<Value>>('Put', { value })),
      onUpdate: ({ current, updates }) =>
        call<Entity<Value>>('Put', { value: { ...current, ...updates } }),
      onDelete: ({ current }) =>
        call<Entity<Value>>('Delete', { id: id(current) }),
    });
  };

  const command = <A>(
    run: (rpc: Rpc['Service']) => Effect.Effect<A, unknown>,
  ) =>
    runtime.runPromise(
      Effect.gen(function* () {
        return yield* run(yield* Rpc);
      }),
    );

  const session: Session & { readonly dispose: () => Promise<void> } = {
    user,
    userId: user.id,
    /** Signs the Session's next requests with a fresh token for its User. */
    setToken: (next: string) => {
      credential.token = next;
    },
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
 * Opens Sessions over `link`, each for as long as its scope lasts: the
 * User's copy, kept in step with the Backend and signed with `token`,
 * closed with the scope.
 */
export const openSessions =
  (link: SessionLink) => (user: User, token: string | null) =>
    Effect.acquireRelease(
      Effect.sync(() => makeSession(link, user, token)),
      (session) => Effect.promise(() => session.dispose()),
    ).pipe(Effect.map((session): Session => session));
