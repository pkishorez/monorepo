import { describe, expect, it } from 'vitest';
import type { EntityBody } from '../../entries/index.js';
import { foldQueue } from '../fold.js';

const insert = (after: unknown): EntityBody => ({
  kind: 'entity',
  op: 'insert',
  key: 'k',
  base: null,
  after,
  changed: [],
});
const update = (
  base: unknown,
  after: unknown,
  changed: string[],
): EntityBody => ({
  kind: 'entity',
  op: 'update',
  key: 'k',
  base,
  after,
  changed,
});
const remove = (base: unknown): EntityBody => ({
  kind: 'entity',
  op: 'delete',
  key: 'k',
  base,
  after: null,
  changed: [],
});

describe('foldQueue', () => {
  it('folds insert + update into one insert of the latest value', () => {
    expect(
      foldQueue([insert({ a: 1 }), update({ a: 1 }, { a: 2 }, ['a'])]),
    ).toEqual({
      op: 'insert',
      value: { a: 2 },
    });
  });
  it('folds insert + delete into nothing', () => {
    expect(foldQueue([insert({ a: 1 }), remove({ a: 1 })])).toEqual({
      op: 'nothing',
    });
  });
  it('merges update + update keeping the first base', () => {
    expect(
      foldQueue([
        update({ a: 1, b: 1 }, { a: 2, b: 1 }, ['a']),
        update({ a: 2, b: 1 }, { a: 2, b: 3 }, ['b']),
      ]),
    ).toEqual({
      op: 'update',
      base: { a: 1, b: 1 },
      after: { a: 2, b: 3 },
      changed: ['a', 'b'],
    });
  });
  it('folds update + delete into a delete of the first base', () => {
    expect(
      foldQueue([update({ a: 1 }, { a: 2 }, ['a']), remove({ a: 2 })]),
    ).toEqual({
      op: 'delete',
      base: { a: 1 },
    });
  });
  it('folds delete + insert into an update', () => {
    expect(foldQueue([remove({ a: 1 }), insert({ a: 5 })])).toEqual({
      op: 'update',
      base: { a: 1 },
      after: { a: 5 },
      changed: ['a'],
    });
  });
});
