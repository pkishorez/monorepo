import { describe, expect, it } from 'vitest';
import type { Definition, Instance } from 'effect-oak';
import { keyLives, pathName, rowsOf, touched } from './change.ts';

const instance = (
  id: string,
  model: unknown,
  state: { readonly _tag: string; readonly [field: string]: unknown } = {
    _tag: 'Single',
  },
  kids: ReadonlyArray<Instance> = [],
): Instance => ({
  id,
  actor: id,
  state,
  model,
  children: kids.length ? { kids } : {},
  invoked: {},
});

/** An Actor whose Workers are only their Conditions: the engine's view of them. */
const actor = (
  name: string,
  workers: Definition['workers'] = {},
  kids?: Definition,
): Definition =>
  ({
    name,
    states: ['Single'],
    workers,
    children: kids
      ? { Single: { kids: { definition: kids, many: true } } }
      : {},
  }) as unknown as Definition;

const noop = () => undefined;
const ONE = [''];
const NONE: ReadonlyArray<string> = [];

/** Runs while the Model says so. */
const polling: Definition['workers'][string] = {
  kind: 'while',
  keys: ({ model }) => ((model as { polling: boolean }).polling ? ONE : NONE),
  run: noop,
};

/** One per upload in the Model. */
const uploads: Definition['workers'][string] = {
  kind: 'each',
  keys: ({ model }) => (model as { uploads: ReadonlyArray<string> }).uploads,
  run: noop,
};

/** Runs while in Running. */
const ticking: Definition['workers'][string] = {
  kind: 'state',
  state: 'Running',
  keys: ({ state }) => (state._tag === 'Running' ? ONE : NONE),
  run: noop,
};

describe('a Step’s Change', () => {
  it('starts every Instance at init', () => {
    const rows = rowsOf({
      before: undefined,
      after: instance('App', {}, undefined, [instance('App/a', {})]),
    });
    expect(rows.map((row) => [row.instance.id, row.life, row.depth])).toEqual([
      ['App', 'started', 0],
      ['App/a', 'started', 1],
    ]);
  });

  it('names only the fields that took a new value', () => {
    const was = instance('Counter', { count: 2, user: { name: 'a', age: 1 } });
    const is = instance('Counter', { count: 3, user: { name: 'a', age: 1 } });
    const [row] = rowsOf({ before: was, after: is });
    expect(row!.fields).toEqual([
      { in: 'model', path: ['count'], kind: 'changed', before: 2, after: 3 },
    ]);
  });

  it('compares lists by position, an added item as one change', () => {
    const was = instance('List', { items: ['a'] });
    const is = instance('List', { items: ['a', 'b'] });
    const [row] = rowsOf({ before: was, after: is });
    expect(row!.fields).toEqual([
      {
        in: 'model',
        path: ['items', 1],
        kind: 'added',
        before: undefined,
        after: 'b',
      },
    ]);
    expect(pathName(row!.fields[0]!.path)).toBe('items[1]');
  });

  it('finds no change in a new object with the same contents', () => {
    const was = instance('Form', { draft: { text: 'hi' } });
    const is = instance('Form', { draft: { text: 'hi' } });
    expect(rowsOf({ before: was, after: is }).some(touched)).toBe(false);
  });

  it('gives a Transition, and the State’s data when it stays', () => {
    const stopped = instance('Watch', {}, { _tag: 'Stopped' });
    const running = instance('Watch', {}, { _tag: 'Running', since: 1 });
    const later = instance('Watch', {}, { _tag: 'Running', since: 4 });
    expect(rowsOf({ before: stopped, after: running })[0]!.transition).toEqual({
      from: 'Stopped',
      to: 'Running',
    });
    expect(rowsOf({ before: running, after: later })[0]!.fields).toEqual([
      { in: 'state', path: ['since'], kind: 'changed', before: 1, after: 4 },
    ]);
  });

  it('keeps a stopped Child beside its parent', () => {
    const a = instance('App/a', {});
    const was = instance('App', {}, undefined, [a, instance('App/b', {})]);
    const is = instance('App', {}, undefined, [a]);
    expect(
      rowsOf({ before: was, after: is }).map((row) => [
        row.instance.id,
        row.life,
      ]),
    ).toEqual([
      ['App', 'kept'],
      ['App/a', 'kept'],
      ['App/b', 'stopped'],
    ]);
  });

  it('carries no Workers without the Actors', () => {
    const was = instance('Sync', { polling: false });
    const is = instance('Sync', { polling: true });
    expect(rowsOf({ before: was, after: is })[0]!.workers).toEqual([]);
  });

  it('starts every Worker whose Condition holds at init', () => {
    const rows = rowsOf(
      { before: undefined, after: instance('Sync', { polling: true }) },
      actor('Sync', { polling }),
    );
    expect(rows[0]!.workers).toEqual([
      { name: 'polling', key: '', life: 'started' },
    ]);
  });

  it('starts and stops a Worker as its Condition comes and goes', () => {
    const sync = actor('Sync', { polling });
    const off = instance('Sync', { polling: false });
    const on = instance('Sync', { polling: true });
    expect(rowsOf({ before: off, after: on }, sync)[0]!.workers).toEqual([
      { name: 'polling', key: '', life: 'started' },
    ]);
    expect(rowsOf({ before: on, after: off }, sync)[0]!.workers).toEqual([
      { name: 'polling', key: '', life: 'stopped' },
    ]);
    expect(rowsOf({ before: on, after: off }, sync).some(touched)).toBe(true);
  });

  it('tells each key apart: the ones after in order, then the ones stopped', () => {
    expect(keyLives(['a', 'b'], ['b', 'c'])).toEqual([
      { key: 'b', life: 'kept' },
      { key: 'c', life: 'started' },
      { key: 'a', life: 'stopped' },
    ]);
    expect(keyLives([], [])).toEqual([]);
  });

  it('follows an each Worker key by key, kept ones first', () => {
    const files = actor('Files', { uploads });
    const was = instance('Files', { uploads: ['a', 'b'] });
    const is = instance('Files', { uploads: ['b', 'c'] });
    expect(rowsOf({ before: was, after: is }, files)[0]!.workers).toEqual([
      { name: 'uploads', key: 'b', life: 'kept' },
      { name: 'uploads', key: 'c', life: 'started' },
      { name: 'uploads', key: 'a', life: 'stopped' },
    ]);
  });

  it('starts a State’s Worker on a Transition into it, and stops it leaving', () => {
    const watch = actor('Watch', { ticking });
    const stopped = instance('Watch', {}, { _tag: 'Stopped' });
    const running = instance('Watch', {}, { _tag: 'Running' });
    expect(
      rowsOf({ before: stopped, after: running }, watch)[0]!.workers,
    ).toEqual([{ name: 'ticking', key: '', life: 'started' }]);
    expect(
      rowsOf({ before: running, after: stopped }, watch)[0]!.workers,
    ).toEqual([{ name: 'ticking', key: '', life: 'stopped' }]);
  });

  it('stops a Child’s Workers with the Child, found through its slot', () => {
    const app = actor('App', {}, actor('Sync', { polling }));
    const kid = instance('App/a', { polling: true });
    const was = instance('App', {}, undefined, [kid]);
    const is = instance('App', {}, undefined, []);
    expect(
      rowsOf({ before: was, after: is }, app).map((row) => [
        row.instance.id,
        row.life,
        row.workers,
      ]),
    ).toEqual([
      ['App', 'kept', []],
      ['App/a', 'stopped', [{ name: 'polling', key: '', life: 'stopped' }]],
    ]);
  });
});
