import { Context, Effect, Layer, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { init, restore } from '../snapshot/index.ts';
import { Actor, History, Runtime } from '../index.ts';
import type { Types } from '../actor/index.ts';
import type { Running } from '../runtime/index.ts';
import { Snapshot } from '../snapshot/index.ts';
import type { Instance } from '../snapshot/index.ts';
import {
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
        expect(app.snapshot().state._tag).toBe('Anonymous');
        expect(Object.keys(app.snapshot().children)).toEqual(['login']);

        app.send('Auth/login#1', { _tag: 'Typed', name: 'ada' });
        app.send('Auth/login#1', { _tag: 'Submitted' });
        yield* settle;
        expect(app.snapshot().state).toEqual({
          _tag: 'Authenticated',
          user: 'ada',
        });

        app.send('Auth/todos#1', { _tag: 'Added', text: 'write tests' });
        expect(at(app, 'Auth/todos#1').model).toEqual({
          items: ['write tests'],
        });

        app.send('Auth/todos#1', { _tag: 'Quit' });
        yield* settle;
        expect(app.snapshot().state._tag).toBe('Anonymous');
        app.send('Auth/todos#1', { _tag: 'Added', text: 'too late' });

        // What came of each entry is worked out, never kept in the History.
        const tagAt = (entry: number | null, id: string) =>
          Snapshot.instanceAt(app.history.snapshotAt(entry), id)?.state._tag ??
          '';
        expect(
          app.history
            .branch()
            .map(
              (e) =>
                `${e.destination} ${e.message._tag} ${app.history.outcome(e.id)} ${tagAt(e.parent, e.destination)}→${tagAt(e.id, e.destination)}`,
            ),
        ).toEqual([
          'Auth CheckedSession handled Checking→Anonymous',
          'Auth/login#1 Typed handled Single→Single',
          'Auth/login#1 Submitted handled Single→Single',
          'Auth LoggedIn handled Anonymous→Authenticated',
          'Auth/todos#1 Added handled Single→Single',
          'Auth/todos#1 Quit handled Single→Single',
          'Auth LoggedOut handled Authenticated→Anonymous',
          'Auth/todos#1 Added dropped →',
        ]);
        // A Request's Source is the Command that made it, in another Instance.
        expect(
          app.history
            .branch()
            .map(({ source }) =>
              source.kind === 'command' || source.kind === 'worker'
                ? `${source.kind} ${source.instance} ${source.name}`
                : source.kind,
            ),
        ).toEqual([
          'worker Auth check',
          'outside',
          'outside',
          'command Auth/login#1 signIn',
          'outside',
          'outside',
          'command Auth/todos#1 logOut',
          'outside',
        ]);
        // Any entry's Snapshot, played again, is the one the app had live.
        expect(app.history.snapshotAt(app.history.head())).toEqual(
          app.snapshot(),
        );
        expect(app.history.snapshotAt(null).state._tag).toBe('Checking');
        // Invoked again, login gets a new ID.
        expect(Object.values(app.snapshot().children)).toMatchObject([
          { id: 'Auth/login#2' },
        ]);

        // A cleared History forgets every Branch, and the app goes live from init.
        yield* app.stop();
        app.history.clear();
        yield* app.start();
        yield* settle;
        expect(app.history.save().entries.map((e) => e.message._tag)).toEqual([
          'CheckedSession',
        ]);
        expect(app.snapshot().state._tag).toBe('Anonymous');
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
        app.send('Auth', { _tag: 'LoggedOut' });
        expect(app.history.outcome(app.history.branch().at(-1)!.id)).toBe(
          'ignored',
        );
      }),
    ));

  it('checks every Message against its Schema, and throws at the Send before anything changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        yield* settle;
        const before = app.snapshot();
        const entries = app.history.branch().length;
        expect(() =>
          app.send('Auth', { _tag: 'Renamed', user: 42 as never }),
        ).toThrow(/Auth: Message "Renamed" does not match its Schema/);
        expect(() => app.send('Auth', { _tag: 'Nope' })).toThrow(
          /Auth: Message "Nope" does not match its Schema/,
        );
        expect(app.snapshot()).toBe(before);
        expect(app.history.branch()).toHaveLength(entries);
        app.send('Auth', { _tag: 'LoggedOut' });
        expect(app.history.branch()).toHaveLength(entries + 1);
      }),
    ));

  it('checks every Input, and the Model and State init and each Update give', () => {
    const Row = Actor.build(
      Actor.define('Row', {
        input: Schema.Struct({ text: Schema.String }),
        model: Schema.Struct({ text: Schema.String }),
      }),
      { init: ({ text }) => ({ model: { text } }) },
    );
    const Sheet = Actor.build(
      Actor.define('Sheet', {
        model: Schema.Struct({ count: Schema.Number, row: Schema.Unknown }),
        state: Schema.TaggedUnion({ Open: {}, Shut: {} }),
        message: Schema.TaggedUnion({
          Counted: { by: Schema.Number },
          Shut: {},
        }),
      }),
      {
        init: () => ({
          model: { count: 0, row: 'a' },
          state: { _tag: 'Open' },
        }),
        children: {
          row: {
            actor: Row,
            input: ({ model }) => ({ text: model.row as string }),
          },
        },
        on: {
          Counted: ({ by }, { model }) => ({
            model: { ...model, count: by > 1 ? (String(by) as never) : by },
          }),
          Shut: () => ({ state: { _tag: 'Closed' } as never }),
        },
      },
    );
    const first = init(Sheet.definition);
    const sent = (message: Types<typeof Sheet>['message']) =>
      Snapshot.handle(Sheet.definition, first, {
        destination: 'Sheet',
        message,
        source: { kind: 'view', instance: 'Sheet' },
        at: 0,
      });

    expect(sent({ _tag: 'Counted', by: 1 }).outcome).toBe('handled');
    expect(() => sent({ _tag: 'Counted', by: 2 })).toThrow(
      /Sheet: the Model the Update for "Counted" in Open gave Sheet does not match its Schema\nExpected number\n {2}at \["count"\]/,
    );
    expect(() => sent({ _tag: 'Shut' })).toThrow(
      /Sheet: the State the Update for "Shut" in Open gave Sheet does not match its Schema/,
    );
    expect(() => init(Row.definition, { text: 7 })).toThrow(
      /Row: the Input of Row does not match its Schema/,
    );
    const Bad = Actor.build(
      Actor.define('Bad', {
        state: Schema.TaggedUnion({ On: {} }),
      }),
      { init: () => ({ state: { _tag: 'Off' } as never }) },
    );
    expect(() => init(Bad.definition)).toThrow(
      /Bad: the State init gave Bad does not match its Schema/,
    );

    // Live, a bad Update changes nothing and throws at the Send.
    return run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Sheet));
        const before = app.snapshot();
        expect(() => app.send('Sheet', { _tag: 'Counted', by: 2 })).toThrow(
          /the Model the Update for "Counted"/,
        );
        expect(app.snapshot()).toBe(before);
        expect(app.history.branch()).toHaveLength(0);
        app.send('Sheet', { _tag: 'Counted', by: 1 });
        expect(app.history.branch()).toHaveLength(1);
      }),
    );
  });

  it('keeps every Instance off the changed path the same object', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Board));
        const before = app.snapshot();
        app.send('Board/left#1', { _tag: 'Bumped' });
        const after = app.snapshot();
        expect(after).not.toBe(before);
        expect(after.children['right']).toBe(before.children['right']);
        expect(after.children['left']).not.toBe(before.children['left']);
      }),
    ));
});

describe('keyed Children', () => {
  const Row = Actor.build(
    Actor.define('Row', {
      input: Schema.Struct({ text: Schema.String }),
      model: Schema.Struct({ text: Schema.String, done: Schema.Boolean }),
      message: Schema.TaggedUnion({ Toggled: {} }),
    }),
    {
      init: ({ text }) => ({ model: { text, done: false } }),
      on: {
        Toggled: (_, { model }) => ({ model: { ...model, done: !model.done } }),
      },
    },
  );

  const List = Actor.build(
    Actor.define('List', {
      model: Schema.Struct({
        ids: Schema.Array(Schema.String),
        next: Schema.Number,
      }),
      message: Schema.TaggedUnion({
        Added: { text: Schema.String },
        Removed: { id: Schema.String },
        Reversed: {},
      }),
    }),
    {
      init: () => ({ model: { ids: [], next: 0 } }),
      children: {
        rows: {
          actor: Row,
          each: ({ model }) => model.ids,
          input: (_, id) => ({ text: `#${id}` }),
        },
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
    },
  );

  const rows = (app: Running<unknown>) =>
    app.snapshot().children['rows'] as ReadonlyArray<Instance>;

  it('follow the Model by key, each starting from its Input', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        app.send('List', { _tag: 'Added', text: '' });
        app.send('List', { _tag: 'Added', text: '' });
        expect(rows(app).map((row) => [row.id, row.model])).toEqual([
          ['List/rows[0]#1', { text: '#0', done: false }],
          ['List/rows[1]#1', { text: '#1', done: false }],
        ]);

        app.send('List/rows[1]#1', { _tag: 'Toggled' });
        const toggled = rows(app)[1];
        app.send('List', { _tag: 'Reversed' });
        expect(rows(app).map((row) => row.key)).toEqual(['1', '0']);
        expect(rows(app)[0]).toBe(toggled);
      }),
    ));

  it('a key Invoked again is a new Instance', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(List));
        app.send('List', { _tag: 'Added', text: '' });
        app.send('List/rows[0]#1', { _tag: 'Toggled' });
        app.send('List', { _tag: 'Removed', id: '0' });
        expect(rows(app)).toEqual([]);
        app.send('List/rows[0]#1', { _tag: 'Toggled' });
        expect(app.history.outcome(app.history.branch().at(-1)!.id)).toBe(
          'dropped',
        );
      }),
    ));

  it('a Child whose Actor takes Input must be handed it', () => {
    const Forgot = Actor.build(Actor.define('Forgot', {}), {
      // @ts-expect-error input is missing
      children: { rows: { actor: Row, each: () => ['a'] } },
    });
    expect(Forgot).toBeDefined();
  });
});

describe('a Child written with `while`', () => {
  /** A Child whose work says when it stops. */
  const Light = Actor.build(Actor.define('Light', {}), {
    workers: {
      glow: {
        run: () =>
          Effect.addFinalizer(() =>
            Effect.sync(() => heard.push('glow stopped')),
          ).pipe(Effect.andThen(Effect.never)),
      },
    },
  });

  const Room = Actor.build(
    Actor.define('Room', {
      model: Schema.Struct({ lit: Schema.Boolean }),
      message: Schema.TaggedUnion({ Switched: {} }),
    }),
    {
      init: () => ({ model: { lit: false } }),
      children: {
        light: { actor: Light, while: ({ model }) => model.lit },
        counter: { actor: Counter, while: ({ model }) => model.lit },
      },
      on: { Switched: (_, { model }) => ({ model: { lit: !model.lit } }) },
    },
  );

  const restored = (snapshot: Instance) =>
    Snapshot.handle(Room.definition, init(Room.definition), {
      destination: 'Room',
      message: restore(snapshot),
      source: { kind: 'restore' },
      at: 0,
    }).outcome;

  it('exists only while its test holds, a fresh Instance each time', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(History.make(Room));
        expect(app.snapshot().children).toEqual({});

        app.send('Room', { _tag: 'Switched' });
        yield* settle;
        expect(Object.keys(app.snapshot().children).sort()).toEqual([
          'counter',
          'light',
        ]);
        app.send('Room/counter#1', { _tag: 'Bumped' });
        expect(at(app, 'Room/counter#1').model).toEqual({ count: 1 });

        app.send('Room', { _tag: 'Switched' });
        yield* settle;
        expect(app.snapshot().children).toEqual({});
        expect(heard).toEqual(['glow stopped']);

        app.send('Room', { _tag: 'Switched' });
        expect(at(app, 'Room/counter#2').model).toEqual({ count: 0 });
        app.send('Room/counter#1', { _tag: 'Bumped' });
        expect(app.history.outcome(app.history.branch().at(-1)!.id)).toBe(
          'dropped',
        );
      }),
    ));

  it('is restored, saved and loaded whether it is there or not', () =>
    run(
      Effect.gen(function* () {
        const live = yield* Runtime.start(History.make(Room));
        expect(restored(live.snapshot())).toBe('handled');
        live.send('Room', { _tag: 'Switched' });
        expect(restored(live.snapshot())).toBe('handled');
        live.send('Room', { _tag: 'Switched' });

        const loaded = yield* Runtime.start(
          History.load(Room, live.history.save()),
        );
        expect(loaded.snapshot()).toEqual(live.snapshot());
      }),
    ));

  it('is checked like any other Child', () => {
    const Forgot = Actor.build(Actor.define('Forgot', {}), {
      children: {
        // @ts-expect-error a Child is written with `while` or `each`, never both
        light: { actor: Light, while: () => true, each: () => ['a'] },
      },
    });
    expect(Forgot).toBeDefined();
  });
});

describe('a single Child written with a `key`', () => {
  const Tab = Actor.build(
    Actor.define('Tab', {
      model: Schema.Struct({ open: Schema.NullOr(Schema.String) }),
      message: Schema.TaggedUnion({
        Opened: { name: Schema.NullOr(Schema.String) },
      }),
    }),
    {
      init: () => ({ model: { open: null } }),
      children: {
        page: {
          actor: Counter,
          while: ({ model }) => model.open !== null,
          key: ({ model }) => model.open ?? '',
        },
      },
      on: { Opened: ({ name }) => ({ model: { open: name } }) },
    },
  );

  it('is one Instance, Invoked again when its key changes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Tab));
        expect(app.snapshot().children).toEqual({});

        app.send('Tab', { _tag: 'Opened', name: 'a' });
        app.send('Tab/page[a]#1', { _tag: 'Bumped' });
        expect(at(app, 'Tab/page[a]#1').model).toEqual({ count: 1 });

        // The same key keeps it.
        app.send('Tab', { _tag: 'Opened', name: 'a' });
        expect(at(app, 'Tab/page[a]#1').model).toEqual({ count: 1 });

        // A new key is a fresh Instance in its place.
        app.send('Tab', { _tag: 'Opened', name: 'b' });
        const held = app.snapshot().children['page'] as Instance;
        expect(held.id).toBe('Tab/page[b]#1');
        expect(held.model).toEqual({ count: 0 });

        const loaded = yield* Runtime.start(
          History.load(Tab, app.history.save()),
        );
        expect(loaded.snapshot()).toEqual(app.snapshot());
      }),
    ));
});

describe('written at the top or in a State', () => {
  class Clock2 extends Context.Service<
    Clock2,
    { readonly tick: Effect.Effect<void> }
  >()('test/Clock2') {}

  /** A Child that counts its own ticks, through the Capability from above. */
  const Ticker = Actor.build(
    Actor.define('Ticker', {
      requires: [Clock2],
      model: Schema.Struct({ ticks: Schema.Number }),
      message: Schema.TaggedUnion({ Ticked: {} }),
    }),
    {
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
    },
  );

  const Door = Actor.build(
    Actor.define('Door', {
      state: Schema.TaggedUnion({ Open: {}, Shut: {} }),
      model: Schema.Struct({ loud: Schema.Boolean }),
      message: Schema.TaggedUnion({ Toggle: {}, Hush: {} }),
    }),
    {
      init: () => ({ model: { loud: true }, state: { _tag: 'Open' } }),
      provides: () =>
        Layer.succeed(Clock2, {
          tick: Effect.sync(() => heard.push('tick')),
        }),
      children: { ticker: { actor: Ticker } },
      on: { Hush: (_, { model }) => ({ model: { ...model, loud: false } }) },
      state: {
        Open: {
          children: { guest: { actor: Counter } },
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
    },
  );

  it('a Child written at the top lasts through Transitions, with its data and work', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(History.make(Door));
        yield* settle;
        expect(heard).toEqual(['tick']);
        expect(Object.keys(app.snapshot().children).sort()).toEqual([
          'guest',
          'ticker',
        ]);

        app.send('Door/ticker#1', { _tag: 'Ticked' });
        app.send('Door', { _tag: 'Toggle' });
        app.send('Door', { _tag: 'Toggle' });
        yield* settle;

        expect(at(app, 'Door/ticker#1').model).toEqual({ ticks: 1 });
        expect(at(app, 'Door/guest#2')).toBeDefined();
        expect(heard).toEqual(['tick', 'creak stopped']);
        expect(app.history.snapshotAt(app.history.head())).toEqual(
          app.snapshot(),
        );
      }),
    ));

  it('a Worker in a State block runs only in that State, and only while its test holds', () =>
    run(
      Effect.gen(function* () {
        heard.length = 0;
        const app = yield* Runtime.start(History.make(Door));
        yield* settle;
        expect(app.workers('Door').map((w) => w.name)).toEqual(['creak']);
        app.send('Door', { _tag: 'Hush' });
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
      Actor.build(
        Actor.define('Twice', {
          state: Schema.TaggedUnion({ A: {} }),
        }),
        {
          init: () => ({ state: { _tag: 'A' } }),
          children: { kid: { actor: Counter } },
          state: { A: { children: { kid: { actor: Counter } } } },
        },
      ),
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
    Actor.build(Actor.define('Forgetful', shape), {
      init: () => ({ state: { _tag: 'A' } }),
      state: {
        A: {
          on: {
            Went: ({ to }) => ({ state: to ? { _tag: 'B' } : { _tag: 'A' } }),
          },
        },
      },
    });
    expect(warned()).toBe(1);
    Actor.build(Actor.define('Careful', shape), {
      init: () => ({ state: { _tag: 'A' } }),
      on: { Forgot: () => ({}) },
      state: { B: { on: { Went: () => ({}) } } },
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
      Actor.build(Typo, {
        init: () => ({ state: { _tag: 'Idle' } }),
        // @ts-expect-error: no Message is tagged Typd
        on: { Typed: () => ({}), Typd: () => ({}) },
        // @ts-expect-error: no State is tagged Lodaing
        state: { Lodaing: {} },
      }),
    ).not.toThrow();
  });
});
