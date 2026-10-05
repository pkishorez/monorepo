import { Effect } from 'effect';
import type { Entity } from '@kstackz/std-toolkit/core';
import type { AnyEntityESchema } from '@kstackz/std-toolkit/eschema';
import {
  createStdSync,
  type StdSyncPlatform,
  strategy,
} from '@kstackz/std-toolkit/sync';
import { browser } from '@kstackz/std-toolkit/sync/platform/browser';
import {
  Account,
  Category,
  Entry,
  Preferences,
} from '../../domain/ledger/index.ts';
import { makeRpcRuntime, Rpc, type RpcRuntime } from '../session/index.ts';

// How often the browser asks for what other devices changed.
const POLL = '10 seconds';

type Kind = 'Accounts' | 'Categories' | 'Entries' | 'Preferences';

/** The name a user's data is kept under in this browser. */
export const ledgerName = (userId: string) => `ledger-${userId}`;

/** Where a Ledger keeps its copy, and how it reaches the server. */
export type LedgerHost = {
  readonly platform: () => StdSyncPlatform;
  readonly runtime: () => RpcRuntime;
};

/** This browser's IndexedDB, and the server at `/rpc`. */
export const browserHost: LedgerHost = {
  platform: () => browser(),
  runtime: makeRpcRuntime,
};

/**
 * One user's money in this browser: a Collection for each kind, kept in
 * IndexedDB and in step with the server, and the server's own commands.
 * Writes show at once and roll back if the server refuses them.
 */
export const openLedger = (userId: string, host: LedgerHost = browserHost) => {
  const runtime = host.runtime();
  const sync = createStdSync({
    name: ledgerName(userId),
    platform: host.platform(),
    runtime,
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

  return {
    userId,
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
};

export type Ledger = ReturnType<typeof openLedger>;
