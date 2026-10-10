import { describe, expect, it } from 'vitest';
import type { Instance } from 'effect-oak';
import { pathName, rowsOf, touched } from './change.ts';

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
});
