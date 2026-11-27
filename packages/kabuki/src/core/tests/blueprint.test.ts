import { Effect, Schema, SchemaAST } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Actor, Blueprint } from '../index.ts';
import type { LiveInstance } from '../types.ts';
import {
  Auth,
  AuthState,
  Board,
  Counter,
  Login,
  Server,
  Session,
  SignIn,
  Todos,
} from './fixtures.ts';

/* The Blueprint: what an Actor is and does, as plain data, with nothing running. */

describe('actor.blueprint', () => {
  it('holds its name, Schemas, Requires and levels', () => {
    const { blueprint } = Auth;
    expect(blueprint.name).toBe('Auth');
    expect(blueprint.requires).toEqual([Server.key]);
    expect(Object.keys(blueprint.state)).toEqual([
      'Checking',
      'Anonymous',
      'Authenticated',
    ]);
    expect(blueprint).not.toHaveProperty('states');
    expect(blueprint.top).toEqual({
      on: {},
      workers: [],
      children: {},
      queries: [],
      provides: [],
    });
    const { Checking, Anonymous, Authenticated } = blueprint.state;
    expect(Checking!.workers).toEqual([{ name: 'check', kind: 'state' }]);
    expect(Object.keys(Checking!.on)).toEqual(['CheckedSession']);
    expect(Anonymous!.provides).toEqual([SignIn.key]);
    expect(Authenticated!.provides).toEqual([Session.key]);
    expect(Anonymous!.children).toEqual({
      login: { blueprint: Login.blueprint, kind: 'always', keyed: false },
    });
    expect(Authenticated!.children['todos']!.blueprint).toBe(Todos.blueprint);
  });

  it('gives each State the Schema of its own data, and each Message its own', () => {
    const { Authenticated } = Auth.blueprint.state;
    expect(Authenticated!.data).toBe(AuthState.cases.Authenticated);
    const decode = Schema.decodeUnknownSync(
      Authenticated!.on['Renamed'] as Schema.Codec<unknown>,
    );
    expect(decode({ _tag: 'Renamed', user: 'ada' })).toEqual({
      _tag: 'Renamed',
      user: 'ada',
    });
    expect(() => decode({ _tag: 'Renamed' })).toThrow();
  });

  it('gives an Actor without States its one, and without a Model an empty one', () => {
    const Plain = Actor.define('Plain', {}).build({});
    expect(Object.keys(Plain.blueprint.state)).toEqual(['Single']);
    expect(
      Schema.decodeUnknownSync(
        Plain.blueprint.state['Single']!.data as Schema.Codec<unknown>,
      )({ _tag: 'Single' }),
    ).toEqual({ _tag: 'Single' });
    expect(
      Schema.decodeUnknownSync(
        Plain.blueprint.schemas.model as Schema.Codec<unknown>,
      )({}),
    ).toEqual({});
  });

  it('keeps top-level Children at the top, and Workers and Queries where written', () => {
    const Asked = Actor.define('Asked', {
      state: { On: {}, Off: {} },
      model: { ids: Schema.Array(Schema.String) },
      queries: {
        size: { result: Schema.Number },
        mood: { result: Schema.String },
      },
    }).build({
      init: () => ({ model: { ids: [] }, state: { _tag: 'On' } }),
      children: {
        rows: Actor.child(Counter, { each: ({ model }) => model.ids }),
      },
      workers: { tick: { while: () => true, run: () => Effect.never } },
      queries: { size: () => Effect.succeed(0) },
      states: {
        On: {
          children: { one: Actor.child(Counter, { key: () => 'k' }) },
          queries: { mood: () => Effect.succeed('fine') },
        },
      },
    });
    const { top, state } = Asked.blueprint;
    expect(top.children).toEqual({
      rows: { blueprint: Counter.blueprint, kind: 'each', keyed: false },
    });
    expect(top.workers).toEqual([{ name: 'tick', kind: 'while' }]);
    expect(top.queries).toEqual(['size']);
    expect(state['On']!.children).toEqual({
      one: { blueprint: Counter.blueprint, kind: 'always', keyed: true },
    });
    expect(state['On']!.queries).toEqual(['mood']);
    expect(state['Off']!.children).toEqual({});
    expect(Object.keys(Asked.blueprint.schemas.queries ?? {})).toEqual([
      'size',
      'mood',
    ]);
  });

  it('is made once, and an Actor that is its own Child below shares it', () => {
    expect(Auth.blueprint).toBe(Auth.blueprint);
    const Folder = Actor.define('Folder', {}).build({});
    // The engine can hold a tree that loops back: made here by hand.
    const definition = Folder.definition as unknown as {
      children: Record<string, Record<string, unknown>>;
      lasting: Array<string>;
    };
    const slot = Board.definition.children['Single']!['left']!;
    definition.children['Single'] = {
      sub: { ...slot, definition: Folder.definition },
    };
    definition.lasting.push('sub');
    const { blueprint } = Folder;
    expect(blueprint.top.children['sub']!.blueprint).toBe(blueprint);
  });
});

describe('Blueprint.at', () => {
  it('finds the Blueprint at a place: its root, then slot by slot', () => {
    expect(Blueprint.at(Auth.blueprint, 'Auth')).toBe(Auth.blueprint);
    expect(Blueprint.at(Auth.blueprint, 'Auth/Anonymous:login')).toBe(
      Login.blueprint,
    );
    expect(Blueprint.at(Auth.blueprint, 'Auth/Authenticated:todos')).toBe(
      Todos.blueprint,
    );
    expect(Blueprint.at(Board.blueprint, 'Board/left')).toBe(Counter.blueprint);
  });

  it('names its State only for a Child written in one', () => {
    expect(Blueprint.at(Auth.blueprint, 'Auth/login')).toBeUndefined();
    expect(Blueprint.at(Board.blueprint, 'Board/Single:left')).toBeUndefined();
    expect(
      Blueprint.at(Auth.blueprint, 'Auth/Authenticated:login'),
    ).toBeUndefined();
  });

  it('finds nothing where nothing is written', () => {
    expect(Blueprint.at(Auth.blueprint, 'App')).toBeUndefined();
    expect(Blueprint.at(Auth.blueprint, 'Auth/Nowhere:todos')).toBeUndefined();
    expect(
      Blueprint.at(Auth.blueprint, 'Auth/Anonymous:login/deeper'),
    ).toBeUndefined();
    expect(Blueprint.at(Board.blueprint, 'Board/toString')).toBeUndefined();
  });
});

describe('what an Actor is about', () => {
  const Lamp = Actor.define('Lamp', {
    description: 'One lamp in a room',
    state: { Off: {}, On: {} },
    message: {
      Switched: Schema.Struct({
        on: Schema.Boolean.annotate({ description: 'Whether it is lit' }),
      }).annotate({ description: 'Turn the lamp on or off' }),
      Dimmed: Schema.Struct({ level: Schema.Number }).check(
        Schema.makeFilter(({ level }) => level >= 0 && level <= 1),
      ),
      Broke: {},
    },
  }).build({
    init: () => ({ state: { _tag: 'Off' } }),
    on: { Broke: () => ({}) },
    states: {
      Off: { on: { Switched: () => ({ state: { _tag: 'On' } }) } },
      On: {
        on: {
          Switched: () => ({ state: { _tag: 'Off' } }),
          Dimmed: () => ({}),
        },
      },
    },
  });

  it('holds the description `define` was given, and none when it was not', () => {
    expect(Lamp.blueprint.description).toBe('One lamp in a room');
    expect(Counter.blueprint).not.toHaveProperty('description');
  });

  it('keeps each Message’s own Schema, with the description it is annotated with', () => {
    const switched = Lamp.blueprint.state['Off']!.on['Switched']!;
    expect(SchemaAST.resolveDescription(switched.ast)).toBe(
      'Turn the lamp on or off',
    );
  });

  it('tags a case written as a struct with its key, and keeps its checks', () => {
    const dimmed = Schema.decodeUnknownSync(
      Lamp.blueprint.state['On']!.on['Dimmed'] as Schema.Codec<unknown>,
    );
    expect(dimmed({ _tag: 'Dimmed', level: 0.5 })).toEqual({
      _tag: 'Dimmed',
      level: 0.5,
    });
    expect(() => dimmed({ _tag: 'Dimmed', level: 2 })).toThrow();
    expectTypeOf<
      Parameters<LiveInstance<typeof Lamp>['send']>[0]
    >().toEqualTypeOf<
      | { readonly _tag: 'Switched'; readonly on: boolean }
      | { readonly _tag: 'Dimmed'; readonly level: number }
      | { readonly _tag: 'Broke' }
    >();
  });

  it('refuses a case written as a Schema that is not a struct', () => {
    expect(() =>
      Actor.define('Odd', {
        message: { Said: Schema.String as never },
      }),
    ).toThrow(
      'the case "Said" is written as its fields or a `Schema.Struct` of them',
    );
  });

  it('Blueprint.handles: the top’s Messages, then the State’s own', () => {
    expect(Blueprint.handles(Lamp.blueprint, 'Off')).toEqual([
      'Broke',
      'Switched',
    ]);
    expect(Blueprint.handles(Lamp.blueprint, 'On')).toEqual([
      'Broke',
      'Switched',
      'Dimmed',
    ]);
    expect(Blueprint.handles(Lamp.blueprint, 'Gone')).toEqual(['Broke']);
  });
});
