import { describe, expect, it } from 'vitest';
import { encodeKeyPart, readKeyPath } from '../index.js';

describe('encodeKeyPart', () => {
  it('keeps numbers in order when compared as strings', () => {
    const numbers = [
      -Infinity,
      -1e300,
      -10,
      -9,
      -1.5,
      -Number.MIN_VALUE,
      0,
      Number.MIN_VALUE,
      0.25,
      1,
      9,
      10,
      100,
      2 ** 53,
      1e300,
      Infinity,
    ];
    const encoded = numbers.map(encodeKeyPart);
    expect(encoded.toSorted()).toEqual(encoded);
    expect(new Set(encoded.map((value) => value.length))).toEqual(
      new Set([16]),
    );
  });

  it('writes -0 as 0 and strings as they are', () => {
    expect(encodeKeyPart(-0)).toBe(encodeKeyPart(0));
    expect(encodeKeyPart('work')).toBe('work');
  });
});

describe('readKeyPath', () => {
  const value = {
    boardId: 'work',
    owner: { kind: 'team', teamId: 't1', seat: 3 },
    assignee: null,
    dueAt: new Date(0),
  };

  it('reads top-level and nested strings and numbers', () => {
    expect(readKeyPath(value, 'boardId')).toBe('work');
    expect(readKeyPath(value, 'owner.teamId')).toBe('t1');
    expect(readKeyPath(value, 'owner.seat')).toBe(3);
  });

  it('reads a missing branch, a null step, or a non-key leaf as absent', () => {
    expect(readKeyPath(value, 'owner.userId')).toBeUndefined();
    expect(readKeyPath(value, 'assignee.id')).toBeUndefined();
    expect(readKeyPath(value, 'dueAt')).toBeUndefined();
    expect(readKeyPath(value, 'owner')).toBeUndefined();
  });
});
