import { describe, expect, it } from 'vitest';
import {
  collectionSyncAddress,
  globalSyncAddress,
  normalizeName,
  partitionKey,
  stdSyncName,
  collectionName,
  partitionSyncAddress,
  strategySyncAddress,
  syncAddress,
} from '../index.js';

describe('sync addresses', () => {
  it.each([
    [' Crème BRÛLÉE ', 'creme-brulee'],
    ['Acme---Production', 'acme-production'],
    ['  Todo   Items  ', 'todo-items'],
    ['UPPER_case', 'upper-case'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it.each(['', ' --- ', '́̈', '🚀'])(
    'rejects empty normalized name %j',
    (name) => {
      expect(() => normalizeName(name)).toThrow(
        'a name must contain at least one letter or number',
      );
    },
  );

  it('builds qualified collection names and readable addresses', () => {
    expect(syncAddress('A')).toBe('a');
    expect(collectionName(stdSyncName('a'), 'B')).toBe('a.b');
    expect(collectionSyncAddress('A', 'B')).toBe('a.b');
    expect(globalSyncAddress('a.b')).toBe('a.b{global}');
    expect(
      partitionSyncAddress('a.b', { field: 'X', value: 'Hello World' }),
    ).toBe('a.b{x=hello-world}');
    expect(
      strategySyncAddress(
        partitionSyncAddress('a.b', { field: 'X', value: 'Hello World' }),
        'Old To New',
      ),
    ).toBe('a.b{x=hello-world}.old-to-new');
  });

  it('does not make lossy addresses the exact partition identity', () => {
    const numeric = { x: 1 };
    const textual = { x: '1' };

    expect(partitionSyncAddress('a.b', { field: 'x', value: numeric.x })).toBe(
      partitionSyncAddress('a.b', { field: 'x', value: textual.x }),
    );
    expect(partitionKey(numeric)).not.toBe(partitionKey(textual));
  });
});
