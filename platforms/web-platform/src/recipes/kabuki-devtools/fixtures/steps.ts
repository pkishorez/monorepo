import { Effect, Schema } from 'effect';
import { Actor, Command, handle, init } from '@kestack/kabuki';
import type { Envelope, Snapshot, Source } from '@kestack/kabuki';

/*
 * Shop: a small app with one of everything the Map draws, and a run of it
 * Step by Step, for the fixtures and the tests.
 *
 *   Shop        States Loading, Open and Closed; a fixed Session at its top
 *   ├ Session   no States; a Worker that always runs
 *   ├ Loading   a Worker written in it
 *   ├ Open      a Catalog and a Cart
 *   │ ├ Catalog no States; keyed Items, and a Worker per thumbnail
 *   │ │ └ Item  States Idle and Saving; Saving owns a Worker
 *   │ └ Cart    States Empty, Filled and Checkout; Checkout owns a Worker
 *   └ Closed    a Notice, with nothing below it
 *
 * Every Step is real: init, then each Envelope through `handle`.
 */

const never = () => Effect.never;

const Item = Actor.define('Item', {
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String }),
  state: Schema.TaggedUnion({ Idle: {}, Saving: {} }),
  message: Schema.TaggedUnion({ Save: {}, Saved: {} }),
});
const ItemLive = Actor.build(Item, {
  init: ({ name }) => ({ model: { name }, state: { _tag: 'Idle' } }),
  state: {
    Idle: { on: { Save: () => ({ state: { _tag: 'Saving' } }) } },
    Saving: {
      workers: { save: { run: never } },
      on: { Saved: () => ({ state: { _tag: 'Idle' } }) },
    },
  },
});

const Catalog = Actor.define('Catalog', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    thumbs: Schema.Array(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Stocked: { ids: Schema.Array(Schema.String) },
    Thumbed: { id: Schema.String },
  }),
});
const CatalogLive = Actor.build(Catalog, {
  init: () => ({
    model: { ids: ['tea', 'cup', 'pot'], thumbs: ['tea', 'cup', 'pot'] },
  }),
  children: {
    items: {
      actor: ItemLive,
      each: ({ model }) => model.ids,
      input: (_, id) => ({ name: id }),
    },
  },
  workers: { thumb: { each: ({ model }) => model.thumbs, run: never } },
  on: {
    Stocked: ({ ids }, { model }) => ({
      model: { ...model, ids: [...model.ids, ...ids] },
    }),
    Thumbed: ({ id }, { model }) => ({
      model: { ...model, thumbs: model.thumbs.filter((kept) => kept !== id) },
    }),
  },
});

const track = Command.make('track', {
  args: Schema.Struct({ count: Schema.Number }),
  run: () => Effect.succeed({ _tag: 'Tracked' as const }),
});

const Cart = Actor.define('Cart', {
  state: Schema.TaggedUnion({
    Empty: {},
    Filled: { count: Schema.Number },
    Checkout: { count: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    Put: { item: Schema.String },
    CheckedOut: {},
    Tracked: {},
  }),
});
const CartLive = Actor.build(Cart, {
  init: () => ({ state: { _tag: 'Empty' } }),
  on: { Tracked: () => ({}) },
  state: {
    Empty: {
      on: {
        Put: () => ({
          state: { _tag: 'Filled', count: 1 },
          command: track({ count: 1 }),
        }),
      },
    },
    Filled: {
      on: {
        Put: (_, { state }) => ({
          state: { _tag: 'Filled', count: state.count + 1 },
          command: track({ count: state.count + 1 }),
        }),
        CheckedOut: (_, { state }) => ({
          state: { _tag: 'Checkout', count: state.count },
        }),
      },
    },
    Checkout: { workers: { pay: { run: never } } },
  },
});

const Session = Actor.define('Session', {
  message: Schema.TaggedUnion({ Beat: {} }),
});
const SessionLive = Actor.build(Session, {
  workers: { heartbeat: { run: never } },
  on: { Beat: () => ({}) },
});

const Notice = Actor.define('Notice', {});
const NoticeLive = Actor.build(Notice, {});

const Shop = Actor.define('Shop', {
  state: Schema.TaggedUnion({ Loading: {}, Open: {}, Closed: {} }),
  message: Schema.TaggedUnion({ Loaded: {}, Close: {} }),
});
export const ShopLive = Actor.build(Shop, {
  init: () => ({ state: { _tag: 'Loading' } }),
  children: { session: { actor: SessionLive } },
  state: {
    Loading: {
      workers: { fetch: { run: never } },
      on: { Loaded: () => ({ state: { _tag: 'Open' } }) },
    },
    Open: {
      children: { catalog: { actor: CatalogLive }, cart: { actor: CartLive } },
      on: { Close: () => ({ state: { _tag: 'Closed' } }) },
    },
    Closed: { children: { notice: { actor: NoticeLive } } },
  },
});

/** One Step of the run: its Snapshot, and the Message that made it with what its Update asked for. */
export interface ShopStep {
  readonly label: string;
  readonly snapshot: Snapshot;
  readonly said?: {
    readonly envelope: Envelope;
    readonly commands: ReadonlyArray<unknown>;
  };
}

const at = (snapshot: Snapshot, path: ReadonlyArray<string>): string => {
  let instance = snapshot;
  for (const slot of path) {
    const held = instance.children[slot]!;
    instance = Array.isArray(held) ? held[0]! : (held as Snapshot);
  }
  return instance.id;
};

const catalog = ['catalog'];
const cart = ['cart'];

/** The run, Message by Message: who Sends what to whom. */
const SCRIPT: ReadonlyArray<{
  readonly to: (snapshot: Snapshot) => string;
  readonly message: {
    readonly _tag: string;
    readonly [field: string]: unknown;
  };
  readonly source: (snapshot: Snapshot, to: string) => Source;
}> = [
  {
    to: (s) => s.id,
    message: { _tag: 'Loaded' },
    source: (_, to) => ({ kind: 'worker', instance: to, name: 'fetch' }),
  },
  {
    to: (s) => at(s, catalog),
    message: { _tag: 'Thumbed', id: 'tea' },
    source: (_, to) => ({
      kind: 'worker',
      instance: to,
      name: 'thumb',
      key: 'tea',
    }),
  },
  {
    to: (s) => at(s, cart),
    message: { _tag: 'Put', item: 'cup' },
    source: (_, to) => ({ kind: 'view', instance: to }),
  },
  {
    to: (s) => {
      const items = (s.children['catalog'] as Snapshot).children[
        'items'
      ] as ReadonlyArray<Snapshot>;
      return items[1]!.id;
    },
    message: { _tag: 'Save' },
    source: (_, to) => ({ kind: 'view', instance: to }),
  },
  {
    to: (s) => at(s, catalog),
    message: {
      _tag: 'Stocked',
      ids: Array.from({ length: 12 }, (_, index) => `jar-${index + 1}`),
    },
    source: () => ({ kind: 'outside' }),
  },
  {
    to: (s) => at(s, cart),
    message: { _tag: 'CheckedOut' },
    source: (_, to) => ({ kind: 'view', instance: to }),
  },
  {
    to: (s) => s.id,
    message: { _tag: 'Close' },
    source: (s) => ({ kind: 'worker', instance: at(s, cart), name: 'pay' }),
  },
  {
    to: (s) => at(s, ['session']),
    message: { _tag: 'Beat' },
    source: (_, to) => ({ kind: 'worker', instance: to, name: 'heartbeat' }),
  },
];

const run = (): ReadonlyArray<ShopStep> => {
  const definition = ShopLive.definition;
  let snapshot = init(definition);
  const steps: ShopStep[] = [{ label: 'init', snapshot }];
  SCRIPT.forEach(({ to, message, source }, index) => {
    const destination = to(snapshot);
    const envelope: Envelope = {
      destination,
      message,
      source: source(snapshot, destination),
      at: (index + 1) * 420,
    };
    const handled = handle(definition, snapshot, envelope);
    snapshot = handled.snapshot;
    steps.push({
      label: message._tag,
      snapshot,
      said: { envelope, commands: handled.commands },
    });
  });
  return steps;
};

export const SHOP_STEPS = run();
