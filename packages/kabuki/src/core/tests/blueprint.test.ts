import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Blueprint } from '../index.ts';
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
