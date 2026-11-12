import { Context, Effect, Layer, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { restore } from '../data/play/index.ts';
import { Actor, Address, History, Runtime, Snapshot } from '../index.ts';
import type { Types } from '../actor/index.ts';
import type { Instance } from '../index.ts';
import {
  line,
  outcome,
  stop,
  to,
  Login,
  Auth,
  settle,
  at,
  run,
  started,
  Counter,
  Board,
  heard,
} from './fixtures.ts';

/* One Actor alive: its States, its Children, keyed or written at the top, as Messages move it. */

describe('a tree of Actors', () => {
  it('moves through States, Invoking and stopping Children', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        expect(app.snapshot.root.state._tag).toBe('Anonymous');
        expect(Object.keys(app.snapshot.root.children)).toEqual(['login']);

        app.send(to(app, 'Auth/Anonymous:login#1'), {
          _tag: 'Typed',
          name: 'ada',
        });
        app.send(to(app, 'Auth/Anonymous:login#1'), { _tag: 'Submitted' });
        yield* settle;
        expect(app.snapshot.root.state).toEqual({
          _tag: 'Authenticated',
          user: 'ada',
        });

        app.send(to(app, 'Auth/Authenticated:todos#1'), {
          _tag: 'Added',
          text: 'write tests',
        });
        expect(at(app, 'Auth/Authenticated:todos#1').model).toEqual({
          items: ['write tests'],
        });

        app.send(to(app, 'Auth/Authenticated:todos#1'), { _tag: 'Quit' });
        yield* settle;
        expect(app.snapshot.root.state._tag).toBe('Anonymous');
        app.send(to(app, 'Auth/Authenticated:todos#1'), {
          _tag: 'Added',
          text: 'too late',
        });

        // What came of each entry is worked out, never kept in the History.
        const tagAt = (entry: number | null, address: string) =>
          Snapshot.at(
            Snapshot.replay(Auth, app.history, entry),
            address as never,
          )?.state._tag ?? '';
        expect(
          line(app).map(
            (e) =>
              `${e.to} ${e.message._tag} ${outcome(app, e.id)} ${tagAt(e.parent, e.to)}→${tagAt(e.id, e.to)}`,
          ),
        ).toEqual([
          'Auth CheckedSession handled Checking→Anonymous',
          'Auth/Anonymous:login#1 Typed handled Single→Single',
          'Auth/Anonymous:login#1 Submitted handled Single→Single',
          'Auth LoggedIn handled Anonymous→Authenticated',
          'Auth/Authenticated:todos#1 Added handled Single→Single',
          'Auth/Authenticated:todos#1 Quit handled Single→Single',
          'Auth LoggedOut handled Authenticated→Anonymous',
          'Auth/Authenticated:todos#1 Added dropped →',
        ]);
        // A Capability's function Sends from the Command that called it, in another Instance.
        expect(
          line(app).map(({ from }) =>
            from.kind === 'command' || from.kind === 'worker'
              ? `${from.kind} ${from.instance} ${from.name}`
              : from.kind,
          ),
        ).toEqual([
          'worker Auth check',
          'outside',
          'outside',
          'command Auth/Anonymous:login#1 signIn',
          'outside',
          'outside',
          'command Auth/Authenticated:todos#1 logOut',
          'outside',
        ]);
        // Any entry's Snapshot, played again, is the one the app had live.
        const again = History.load(Auth, History.save(Auth, app.history));
        expect(Snapshot.replay(Auth, again)).toEqual(app.snapshot);
        expect(Snapshot.replay(Auth, again, null).root.state._tag).toBe(
          'Checking',
        );
        // Invoked again, login gets a new Address.
        expect(Object.values(app.snapshot.root.children)).toMatchObject([
          { address: 'Auth/Anonymous:login#2' },
        ]);
      }),
    ));

  it('names every State an Actor can be in', () => {
    expect(Auth.definition.states).toEqual([
      'Checking',
      'Anonymous',
      'Authenticated',
    ]);
    expect(Login.definition.states).toEqual(['Single']);
  });

  it('ignores a Message the current State has no rule for', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        app.send(to(app, 'Auth'), { _tag: 'LoggedOut' });
        expect(outcome(app, line(app).at(-1)!.id)).toBe('ignored');
      }),
    ));

  it('checks every Message against its Schema, and throws at the Send before anything changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        const before = app.snapshot;
        const entries = line(app).length;
        expect(() =>
          app.send(to(app, 'Auth'), { _tag: 'Renamed', user: 42 as never }),
        ).toThrow(/Auth: Message "Renamed" does not match its Schema/);
        expect(() => app.send(to(app, 'Auth'), { _tag: 'Nope' })).toThrow(
          /Auth: Message "Nope" does not match its Schema/,
        );
        expect(app.snapshot).toBe(before);
        expect(line(app)).toHaveLength(entries);
        app.send(to(app, 'Auth'), { _tag: 'LoggedOut' });
        expect(line(app)).toHaveLength(entries + 1);
      }),
    ));

  it('checks every Input, and the Model and State init and each Update give', () => {
    const Row = Actor.define('Row', {
      input: Schema.Struct({ text: Schema.String }),
      model: Schema.Struct({ text: Schema.String }),
    }).build({ init: ({ text }) => ({ model: { text } }) });
    const Sheet = Actor.define('Sheet', {
      model: Schema.Struct({ count: Schema.Number, row: Schema.Unknown }),
      state: Schema.TaggedUnion({ Open: {}, Shut: {} }),
      message: Schema.TaggedUnion({
        Counted: { by: Schema.Number },
        Shut: {},
      }),
    }).build({
      init: () => ({
        model: { count: 0, row: 'a' },
        state: { _tag: 'Open' },
      }),
      children: {
        row: Actor.child(Row, {
          input: ({ model }) => ({ text: model.row as string }),
        }),
      },
      on: {
        Counted: ({ by }, { model }) => ({
          model: { ...model, count: by > 1 ? (String(by) as never) : by },
        }),
        Shut: () => ({ state: { _tag: 'Closed' } as never }),
      },
    });
    const first = Snapshot.init(Sheet);
    const sent = (message: Types<typeof Sheet>['message']) =>
      Snapshot.play(Sheet, first, {
        id: 0,
        parent: null,
        to: first.root.address,
        message,
        from: { kind: 'view', instance: first.root.address },
        at: 0,
      });

    expect(sent({ _tag: 'Counted', by: 1 }).outcome).toBe('handled');
    expect(() => sent({ _tag: 'Counted', by: 2 })).toThrow(
      /Sheet: the Model the Update for "Counted" in Open gave Sheet does not match its Schema\nExpected number\n {2}at \["count"\]/,
    );
    expect(() => sent({ _tag: 'Shut' })).toThrow(
      /Sheet: the State the Update for "Shut" in Open gave Sheet does not match its Schema/,
    );
    expect(() => Snapshot.init(Row, { text: 7 as never })).toThrow(
      /Row: the Input of Row does not match its Schema/,
    );
    const Bad = Actor.define('Bad', {
      state: Schema.TaggedUnion({ On: {} }),
    }).build({ init: () => ({ state: { _tag: 'Off' } as never }) });
    expect(() => Snapshot.init(Bad)).toThrow(
      /Bad: the State init gave Bad does not match its Schema/,
    );

    // Running, a bad Update changes nothing and throws at the Send.
    return run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Sheet);
        const before = app.snapshot.root;
        expect(() =>
          app.send(to(app, 'Sheet'), { _tag: 'Counted', by: 2 }),
        ).toThrow(/the Model the Update for "Counted"/);
        expect(app.snapshot.root).toBe(before);
        expect(line(app)).toHaveLength(0);
        app.send(to(app, 'Sheet'), { _tag: 'Counted', by: 1 });
        expect(line(app)).toHaveLength(1);
      }),
    );
  });

  it('keeps every Instance off the changed path the same object', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Board);
        const before = app.snapshot.root;
        app.send(to(app, 'Board/left#1'), { _tag: 'Bumped' });
        const after = app.snapshot.root;
        expect(after).not.toBe(before);
        expect(after.children['right']).toBe(before.children['right']);
        expect(after.children['left']).not.toBe(before.children['left']);
      }),
    ));
});

describe('keyed Children', () => {
  const Row = Actor.define('Row', {
    input: Schema.Struct({ text: Schema.String }),
    model: Schema.Struct({ text: Schema.String, done: Schema.Boolean }),
    message: Schema.TaggedUnion({ Toggled: {} }),
  }).build({
    init: ({ text }) => ({ model: { text, done: false } }),
    on: {
      Toggled: (_, { model }) => ({ model: { ...model, done: !model.done } }),
    },
  });

  const List = Actor.define('List', {
    model: Schema.Struct({
      ids: Schema.Array(Schema.String),
      next: Schema.Number,
    }),
    message: Schema.TaggedUnion({
      Added: { text: Schema.String },
      Removed: { id: Schema.String },
      Reversed: {},
    }),
  }).build({
    init: () => ({ model: { ids: [], next: 0 } }),
    children: {
      rows: Actor.child(Row, {
        each: ({ model }) => model.ids,
        input: (_, id) => ({ text: `#${id}` }),
      }),
    },
    on: {
      Added: (_, { model }) => ({
        model: { ids: [...model.ids, `${model.next}`], next: model.next + 1 },
      }),
      Removed: ({ id }, { model }) => ({
        model: { ...model, ids: model.ids.filter((kept) => kept !== id) },
      }),
      Reversed: (_, { model }) => ({
        model: { ...model, ids: [...model.ids].reverse() },
      }),
    },
  });

  const rows = (app: Runtime<any>) =>
    app.snapshot.root.children['rows'] as ReadonlyArray<Instance>;

  it('follow the Model by key, each starting from its Input', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(List);
        app.send(to(app, 'List'), { _tag: 'Added', text: '' });
        app.send(to(app, 'List'), { _tag: 'Added', text: '' });
        expect(rows(app).map((row) => [row.address, row.model])).toEqual([
          ['List/rows[0]#1', { text: '#0', done: false }],
          ['List/rows[1]#1', { text: '#1', done: false }],
        ]);

        app.send(to(app, 'List/rows[1]#1'), { _tag: 'Toggled' });
        const toggled = rows(app)[1];
        app.send(to(app, 'List'), { _tag: 'Reversed' });
        expect(
          rows(app).map((row) => Address.parse(row.address).path[0]!.key),
        ).toEqual(['1', '0']);
        expect(rows(app)[0]).toBe(toggled);
      }),
    ));

  it('a key Invoked again is a new Instance', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(List);
        app.send(to(app, 'List'), { _tag: 'Added', text: '' });
        app.send(to(app, 'List/rows[0]#1'), { _tag: 'Toggled' });
        app.send(to(app, 'List'), { _tag: 'Removed', id: '0' });
        expect(rows(app)).toEqual([]);
        app.send(to(app, 'List/rows[0]#1'), { _tag: 'Toggled' });
        expect(outcome(app, line(app).at(-1)!.id)).toBe('dropped');
      }),
    ));

  it('a Child whose Actor takes Input must be handed it', () => {
    const Forgot = Actor.define('Forgot', {}).build({
      // @ts-expect-error input is missing
      children: { rows: Actor.child(Row, { each: () => ['a'] }) },
    });
    expect(Forgot).toBeDefined();
  });
});

describe('a Child written with `while`', () => {
  /** A Child whose work says when it stops. */
  const Light = Actor.define('Light', {}).build({
    workers: {
      glow: {
        run: () =>
          Effect.addFinalizer(() =>
            Effect.sync(() => heard.push('glow stopped')),
          ).pipe(Effect.andThen(Effect.never)),
      },
    },
  });

  const Room = Actor.define('Room', {
    model: Schema.Struct({ lit: Schema.Boolean }),
    message: Schema.TaggedUnion({ Switched: {} }),
  }).build({
    init: () => ({ model: { lit: false } }),
    children: {
      light: Actor.child(Light, { while: ({ model }) => model.lit }),
      counter: Actor.child(Counter, { while: ({ model }) => model.lit }),
    },
    on: { Switched: (_, { model }) => ({ model: { lit: !model.lit } }) },
  });

  const restored = (root: Instance) => {
    const first = Snapshot.init(Room);
    return Snapshot.play(Room, first, {
      id: 0,
      parent: null,
      to: first.root.address,
      message: restore(root),
      from: { kind: 'restore' },
      at: 0,
    }).outcome;
  };

  it('exists only while its test holds, a fresh Instance each time', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.scoped(Room);
        expect(app.snapshot.root.children).toEqual({});

        app.send(to(app, 'Room'), { _tag: 'Switched' });
        yield* settle;
        expect(Object.keys(app.snapshot.root.children).sort()).toEqual([
          'counter',
          'light',
        ]);
        app.send(to(app, 'Room/counter#1'), { _tag: 'Bumped' });
        expect(at(app, 'Room/counter#1').model).toEqual({ count: 1 });

        app.send(to(app, 'Room'), { _tag: 'Switched' });
        yield* settle;
        expect(app.snapshot.root.children).toEqual({});
        expect(heard).toEqual(['glow stopped']);

        app.send(to(app, 'Room'), { _tag: 'Switched' });
        expect(at(app, 'Room/counter#2').model).toEqual({ count: 0 });
        app.send(to(app, 'Room/counter#1'), { _tag: 'Bumped' });
        expect(outcome(app, line(app).at(-1)!.id)).toBe('dropped');
      }),
    ));

  it('is restored, saved and loaded whether it is there or not', () =>
    run(
      Effect.gen(function* () {
        const live = yield* Runtime.scoped(Room);
        expect(restored(live.snapshot.root)).toBe('handled');
        live.send(to(live, 'Room'), { _tag: 'Switched' });
        expect(restored(live.snapshot.root)).toBe('handled');
        live.send(to(live, 'Room'), { _tag: 'Switched' });

        const loaded = yield* Runtime.scoped(Room, {
          history: History.load(Room, History.save(Room, live.history)),
        });
        expect(loaded.snapshot).toEqual(live.snapshot);
      }),
    ));

  it('is checked like any other Child', () => {
    const Forgot = Actor.define('Forgot', {}).build({
      children: {
        // @ts-expect-error a Child is written with `while` or `each`, never both
        light: Actor.child(Light, { while: () => true, each: () => ['a'] }),
      },
    });
    expect(Forgot).toBeDefined();
  });
});

describe('a single Child written with a `key`', () => {
  const Tab = Actor.define('Tab', {
    model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
    message: Schema.TaggedUnion({
      Opened: { name: Schema.NullOr(Schema.String) },
    }),
  }).build({
    init: () => ({ model: { open: null } }),
    children: {
      page: Actor.child(Counter, {
        while: ({ model }) => model.open !== null,
        key: ({ model }) => model.open ?? '',
      }),
    },
    on: { Opened: ({ name }) => ({ model: { open: name } }) },
  });

  it('is one Instance, Invoked again when its key changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Tab);
        expect(app.snapshot.root.children).toEqual({});

        app.send(to(app, 'Tab'), { _tag: 'Opened', name: 'a' });
        app.send(to(app, 'Tab/page[a]#1'), { _tag: 'Bumped' });
        expect(at(app, 'Tab/page[a]#1').model).toEqual({ count: 1 });

        // The same key keeps it.
        app.send(to(app, 'Tab'), { _tag: 'Opened', name: 'a' });
        expect(at(app, 'Tab/page[a]#1').model).toEqual({ count: 1 });

        // A new key is a fresh Instance in its place.
        app.send(to(app, 'Tab'), { _tag: 'Opened', name: 'b' });
        const held = app.snapshot.root.children['page'] as Instance;
        expect(held.address).toBe('Tab/page[b]#1');
        expect(held.model).toEqual({ count: 0 });

        const loaded = yield* Runtime.scoped(Tab, {
          history: History.load(Tab, History.save(Tab, app.history)),
        });
        expect(loaded.snapshot).toEqual(app.snapshot);
      }),
    ));
});

describe('written at the top or in a State', () => {
  class Clock2 extends Context.Service<
    Clock2,
    { readonly tick: Effect.Effect<void> }
  >()('test/Clock2') {}

  /** A Child that counts its own ticks, through the Capability from above. */
  const Ticker = Actor.define('Ticker', {
    requires: [Clock2],
    model: Schema.Struct({ ticks: Schema.Number }),
    message: Schema.TaggedUnion({ Ticked: {} }),
  }).build({
    init: () => ({ model: { ticks: 0 } }),
    on: { Ticked: (_, { model }) => ({ model: { ticks: model.ticks + 1 } }) },
    workers: {
      alive: {
        run: () =>
          Effect.addFinalizer(() =>
            Effect.sync(() => heard.push('ticker gone')),
          ).pipe(
            Effect.andThen(Effect.flatMap(Clock2, (clock) => clock.tick)),
            Effect.andThen(Effect.never),
          ),
      },
    },
  });

  const Door = Actor.define('Door', {
    state: Schema.TaggedUnion({ Open: {}, Shut: {} }),
    model: Schema.Struct({ loud: Schema.Boolean }),
    message: Schema.TaggedUnion({ Toggle: {}, Hush: {} }),
  }).build({
    init: () => ({ model: { loud: true }, state: { _tag: 'Open' } }),
    provides: {
      capabilities: [Clock2],
      layer: () =>
        Layer.succeed(Clock2, {
          tick: Effect.sync(() => heard.push('tick')),
        }),
    },
    children: { ticker: Actor.child(Ticker) },
    on: { Hush: (_, { model }) => ({ model: { ...model, loud: false } }) },
    states: {
      Open: {
        children: { guest: Actor.child(Counter) },
        on: { Toggle: () => ({ state: { _tag: 'Shut' } }) },
        workers: {
          creak: {
            while: ({ model }) => model.loud,
            run: () =>
              Effect.addFinalizer(() =>
                Effect.sync(() => heard.push('creak stopped')),
              ).pipe(Effect.andThen(Effect.never)),
          },
        },
      },
      Shut: { on: { Toggle: () => ({ state: { _tag: 'Open' } }) } },
    },
  });

  it('a Child written at the top lasts through Transitions, with its data and work', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.scoped(Door);
        yield* settle;
        expect(heard).toEqual(['tick']);
        expect(Object.keys(app.snapshot.root.children).sort()).toEqual([
          'guest',
          'ticker',
        ]);

        app.send(to(app, 'Door/ticker#1'), { _tag: 'Ticked' });
        app.send(to(app, 'Door'), { _tag: 'Toggle' });
        app.send(to(app, 'Door'), { _tag: 'Toggle' });
        yield* settle;

        expect(at(app, 'Door/ticker#1').model).toEqual({ ticks: 1 });
        expect(at(app, 'Door/Open:guest#2')).toBeDefined();
        expect(heard).toEqual(['tick', 'creak stopped']);
        expect(
          Snapshot.replay(
            Door,
            History.load(Door, History.save(Door, app.history)),
          ),
        ).toEqual(app.snapshot);
      }),
    ));

  it('a Worker in a State block runs only in that State, and only while its test holds', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.scoped(Door);
        yield* settle;
        expect(app.workers(to(app, 'Door')).map((w) => w.name)).toEqual([
          'creak',
        ]);
        app.send(to(app, 'Door'), { _tag: 'Hush' });
        yield* settle;
        expect(heard).toEqual(['tick', 'creak stopped']);
        expect(Door.definition.workers['creak']).toMatchObject({
          kind: 'while',
          state: 'Open',
        });
      }),
    ));

  it('a top-level Child is drawn in every State', () => {
    const kids: Types<typeof Door>['children']['Shut'] = {
      ticker: { actor: Ticker },
    };
    expect(kids).toBeDefined();
  });

  it('a name written twice is an error', () => {
    expect(() =>
      Actor.define('Twice', {
        state: Schema.TaggedUnion({ A: {} }),
      }).build({
        init: () => ({ state: { _tag: 'A' } }),
        children: { kid: Actor.child(Counter) },
        // @ts-expect-error a slot name is used once per Actor
        states: { A: { children: { kid: Actor.child(Counter) } } },
      }),
    ).toThrow('Child "kid" is written at the top and in A');
  });

  it('a Message with no rule at any level is warned about once, when built', () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    const shape = {
      state: Schema.TaggedUnion({ A: {}, B: {} }),
      message: Schema.Union([
        Schema.TaggedStruct('Went', { to: Schema.String }),
        Schema.TaggedStruct('Forgot', {}),
      ]),
    };
    const warned = () =>
      logged.mock.calls.filter((call) =>
        call.join(' ').includes('Message "Forgot" has no rule'),
      ).length;
    Actor.define('Forgetful', shape).build({
      init: () => ({ state: { _tag: 'A' } }),
      states: {
        A: {
          on: {
            Went: ({ to }) => ({ state: to ? { _tag: 'B' } : { _tag: 'A' } }),
          },
        },
      },
    });
    expect(warned()).toBe(1);
    Actor.define('Careful', shape).build({
      init: () => ({ state: { _tag: 'A' } }),
      on: { Forgot: () => ({}) },
      states: { B: { on: { Went: () => ({}) } } },
    });
    expect(warned()).toBe(1);
    logged.mockRestore();
  });

  it('a misspelled Message or State does not compile', () => {
    const Typo = Actor.define('Typo', {
      state: Schema.TaggedUnion({ Idle: {}, Loading: {} }),
      message: Schema.TaggedUnion({ Typed: {} }),
    });
    expect(() =>
      Typo.build({
        init: () => ({ state: { _tag: 'Idle' } }),
        // @ts-expect-error: no Message is tagged Typd
        on: { Typed: () => ({}), Typd: () => ({}) },
        // @ts-expect-error: no State is tagged Lodaing
        states: { Lodaing: {} },
      }),
    ).not.toThrow();
  });
});
