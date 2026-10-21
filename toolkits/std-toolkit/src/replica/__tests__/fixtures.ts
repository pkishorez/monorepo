import { Actor, History, Runtime } from '@kestack/kabuki';
import type { Running as App } from '@kestack/kabuki';
import { Deferred, Effect, Layer, Schema, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import { expect, vi } from 'vitest';
import type { Entity } from '../../core/index.js';
import { EntityESchema, type AnyEntityESchema } from '../../eschema/index.js';
import { Action, oldToNew, Query, Replica, Replicas, Store } from '../index.js';

/*
 * One small world to test Replica in: a Pocket of wallets and entries per
 * account, a Backend that serves them and counts every read, and an app
 * whose root Provides Replicas, with a page under it that reads two
 * accounts and asks for Transfers.
 */

export const Wallet = EntityESchema.make('Wallet', 'id', {
  account: Schema.String,
  name: Schema.String,
  balance: Schema.Finite,
}).build();

export const Entry = EntityESchema.make('Entry', 'id', {
  account: Schema.String,
  wallet: Schema.String,
  amount: Schema.Finite,
}).build();

export const Pocket = Replica.define('pocket', {
  key: Schema.String,
  collections: { wallets: Wallet, entries: Entry },
});

export type Wire = Entity<unknown>;

/** The Backend: every Entity it holds, in encoded form, and each read of it. */
export const makeBackend = () => {
  let clock = 0;
  const held: Wire[] = [];
  const reads: Array<{
    readonly entity: string;
    readonly key: string;
    readonly after: string | null;
  }> = [];
  const nextU = () => String(++clock).padStart(10, '0');

  /** Keeps an Entity at its latest version, or at the version given. */
  const put = <S extends AnyEntityESchema>(
    schema: S,
    value: S['Type'],
    options: { readonly deleted?: boolean; readonly version?: string } = {},
  ): Wire => {
    const encoded = Schema.encodeSync(schema.entity)({
      value,
      meta: {
        _e: schema.name,
        _v: schema.latestVersion,
        _d: options.deleted ?? false,
        _u: nextU(),
      },
    }) as Wire;
    const entity: Wire =
      options.version === undefined
        ? encoded
        : { ...encoded, meta: { ...encoded.meta, _v: options.version } };
    held.push(entity);
    return entity;
  };

  const fetch =
    (entity: string) =>
    ({ key, after }: { readonly key: string; readonly after: Wire | null }) =>
      Effect.sync(() => {
        reads.push({ entity, key, after: after?.meta._u ?? null });
        return held.filter(
          (each) =>
            each.meta._e === entity &&
            (each.value as { readonly account: string }).account === key &&
            (after === null || each.meta._u > after.meta._u),
        );
      });

  return { put, fetch, reads, nextU };
};

export type Backend = ReturnType<typeof makeBackend>;

export interface WorldOptions {
  readonly linger?: number;
  readonly keep?: boolean;
  /** Whether each Key's Gate starts open. */
  readonly gate?: boolean;
  readonly backend?: Backend;
}

/**
 * Builds the app around one Backend. The Transfer Action moves `amount`
 * from a wallet of `from` to a wallet of `to`, waiting on `answer` before the
 * Backend answers, so a test sees the Optimistic Changes meanwhile.
 */
export const makeWorld = (options: WorldOptions = {}) => {
  const backend = options.backend ?? makeBackend();
  const gate = Effect.runSync(SubscriptionRef.make(options.gate ?? true));
  let answer = Deferred.makeUnsafe<'ok' | 'refuse'>();
  Deferred.doneUnsafe(answer, Effect.succeed('ok'));
  let captured: Replicas['Service'] | undefined;

  const PocketLive = Replica.build(Pocket, {
    gate: () => SubscriptionRef.changes(gate),
    collections: {
      wallets: {
        strategy: oldToNew({
          fetch: backend.fetch('Wallet'),
          pollEvery: '20 millis',
        }),
      },
      entries: {
        strategy: oldToNew({
          fetch: backend.fetch('Entry'),
          pollEvery: '20 millis',
        }),
      },
    },
  });

  const Wallets = Query.define('Wallets', {
    props: Schema.Struct({ account: Schema.String }),
    from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
    query:
      (_, { pocket }) =>
      (q) =>
        q.from({ w: pocket.wallets }),
  });

  const Transfer = Action.make('Transfer', {
    args: Schema.Struct({
      from: Schema.String,
      to: Schema.String,
      wallet: Schema.String,
      into: Schema.String,
      amount: Schema.Finite,
    }),
    run: (args) =>
      Effect.gen(function* () {
        const from = yield* Pocket.get(args.from);
        const to = yield* Pocket.get(args.to);
        const before = from.wallets.get(args.wallet)!;
        const after = to.wallets.get(args.into)!;
        yield* Action.optimistic(() => {
          from.wallets.update(args.wallet, (draft) => {
            draft.balance -= args.amount;
          });
          to.wallets.update(args.into, (draft) => {
            draft.balance += args.amount;
          });
          from.entries.insert({
            id: `entry-${args.wallet}`,
            account: args.from,
            wallet: args.wallet,
            amount: -args.amount,
          });
        });
        if ((yield* Deferred.await(answer)) === 'refuse')
          return yield* Effect.fail(new Error('The Backend refused'));
        const saved = [
          backend.put(Wallet, {
            id: before.id,
            account: args.from,
            name: before.name,
            balance: before.balance - args.amount,
          }),
          backend.put(Entry, {
            id: `entry-${args.wallet}`,
            account: args.from,
            wallet: args.wallet,
            amount: -args.amount,
          }),
        ];
        yield* from.confirm(saved);
        yield* to.confirm([
          backend.put(Wallet, {
            id: after.id,
            account: args.to,
            name: after.name,
            balance: after.balance + args.amount,
          }),
        ]);
      }),
  });

  const Page = Actor.build(
    Actor.define('Page', {
      requires: [Replicas],
      model: Schema.Struct({
        mine: Schema.String,
        theirs: Schema.String,
        shown: Schema.Boolean,
        ended: Schema.Array(Schema.NullOr(Schema.String)),
        /** The wallet each ended Transfer was asked for, from its args. */
        endedFor: Schema.Array(Schema.String),
      }),
      message: Schema.TaggedUnion({
        Switched: { mine: Schema.String },
        Shown: { shown: Schema.Boolean },
        Asked: {
          from: Schema.String,
          to: Schema.String,
          wallet: Schema.String,
          into: Schema.String,
          amount: Schema.Finite,
        },
        Transfer: Transfer.result,
      }),
    }),
    {
      init: () => ({
        model: { mine: 'a', theirs: 'b', shown: true, ended: [], endedFor: [] },
      }),
      children: {
        mine: {
          actor: Wallets,
          while: ({ model }) => model.shown,
          props: ({ model }) => ({ account: model.mine }),
        },
        theirs: {
          actor: Wallets,
          while: ({ model }) => model.shown,
          props: ({ model }) => ({ account: model.theirs }),
        },
      },
      workers: {
        // Lets a test hold Instances itself, as the code under this page would.
        capture: {
          run: () =>
            Effect.flatMap(Replicas, (replicas) =>
              Effect.sync(() => {
                captured = replicas;
              }),
            ),
        },
      },
      on: {
        Switched: ({ mine }, { model }) => ({ model: { ...model, mine } }),
        Shown: ({ shown }, { model }) => ({ model: { ...model, shown } }),
        Asked: ({ _tag, ...args }) => ({ command: Transfer(args) }),
        Transfer: ({ args, failed }, { model }) => ({
          model: {
            ...model,
            ended: [...model.ended, failed],
            endedFor: [...model.endedFor, args.wallet],
          },
        }),
      },
    },
  );

  const Root = Actor.build(Actor.define('Root', {}), {
    provides: () =>
      Replicas.layer({
        linger: options.linger ?? 50,
        ...(options.keep ? { keep: [Pocket] } : {}),
      }),
    children: {
      replicas: Replicas.child([PocketLive]),
      page: { actor: Page },
    },
  });

  return {
    backend,
    Root,
    setGate: (open: boolean) => SubscriptionRef.set(gate, open),
    /** The next Transfer waits for `respond` before the Backend answers. */
    holdAnswer: () =>
      Effect.sync(() => {
        answer = Deferred.makeUnsafe();
        return (reply: 'ok' | 'refuse') =>
          Effect.asVoid(Deferred.succeed(answer, reply));
      }),
    /** Runs an effect as code under the page would, with Replicas. */
    under: <A, E>(effect: Effect.Effect<A, E, Replicas | Scope.Scope>) =>
      Effect.suspend(() => {
        if (captured === undefined)
          return Effect.die('the page has not started');
        return Effect.scoped(Effect.provideService(effect, Replicas, captured));
      }),
  };
};

export type World = ReturnType<typeof makeWorld>;

/** Starts the world's app on a Store, keeping every Message. */
export const start = (world: World, store: Layer.Layer<Store>) =>
  Runtime.start(History.make(world.Root, { window: null }), store);

/** Waits until the assertion holds, as the app settles. */
export const eventually = (assertion: () => void, timeout = 2000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 5 }));

type Page = {
  readonly model: {
    readonly mine: string;
    readonly ended: ReadonlyArray<string | null>;
    readonly endedFor: ReadonlyArray<string>;
  };
  readonly children: {
    readonly mine?: { readonly model: QueryModel };
    readonly theirs?: { readonly model: QueryModel };
  };
};

export type QueryModel = {
  readonly keys: ReadonlyArray<string>;
  readonly status: string;
  readonly problem: string | null;
  readonly rows: ReadonlyArray<{
    readonly id: string | number;
    readonly row: {
      readonly id: string;
      readonly account: string;
      readonly balance: number;
      readonly name: string;
    };
  }>;
};

export type RunningInstance = Effect.Success<
  Replicas['Service']['current']
>[number];

/** What the test reads of a running app: the page, and Replicas' Model. */
export const read = (app: App<World['Root']>) => {
  const root = app.instance({ from: 'test' }) as unknown as {
    readonly children: {
      readonly page: Page;
      readonly replicas: {
        readonly model: { readonly instances: ReadonlyArray<RunningInstance> };
      };
    };
  };
  return {
    page: () => root.children.page,
    mine: () => root.children.page.children.mine?.model,
    theirs: () => root.children.page.children.theirs?.model,
    instances: () => root.children.replicas.model.instances,
    instance: (key: string) =>
      root.children.replicas.model.instances.find((each) => each.key === key),
  };
};

export const balances = (model: QueryModel | undefined) =>
  Object.fromEntries(
    (model?.rows ?? []).map(({ row }) => [row.id, row.balance]),
  );

export const expectReady = (model: QueryModel | undefined) => {
  expect(model?.status).toBe('ready');
  return model!;
};

/** Every Message the app handled at an Instance whose id starts with `prefix`. */
export const messagesAt = (app: App<World['Root']>, prefix: string) =>
  app.history
    .branch()
    .filter((entry) => entry.destination.startsWith(prefix))
    .map(
      (entry) =>
        entry.message as { readonly _tag: string } & Record<string, unknown>,
    );

export const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

/** Writes Entities straight into an Instance's space, as another participant would have. */
export const seed = (
  store: Layer.Layer<Store>,
  name: string,
  collection: string,
  entities: ReadonlyArray<{ readonly id: string; readonly entity: Wire }>,
) =>
  Effect.flatMap(Store, (kept) =>
    Effect.scoped(
      Effect.flatMap(kept.open(name), (space) =>
        space.write([{ collection, records: entities }]),
      ),
    ),
  ).pipe(Effect.provide(store));

/** Everything an Instance's space holds of a Collection, tombstones too, and its cursor. */
export const stored = (
  store: Layer.Layer<Store>,
  name: string,
  collection: string,
) =>
  Effect.flatMap(Store, (kept) =>
    Effect.scoped(
      Effect.flatMap(kept.open(name), (space) =>
        Effect.all({
          records: Effect.map(
            space.read(collection, null),
            ({ records }) => records,
          ),
          cursor: space.cursor(collection),
        }),
      ),
    ),
  ).pipe(Effect.provide(store));
