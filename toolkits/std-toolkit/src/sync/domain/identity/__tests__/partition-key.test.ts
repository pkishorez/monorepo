import { describe, expect, it } from 'vitest';
import { partitionKey } from '../index.js';

describe('partition key', () => {
  it('is independent of field insertion order', () => {
    expect(partitionKey({ status: 'open', archived: false })).toBe(
      partitionKey({ archived: false, status: 'open' }),
    );
  });

  it('keeps values of different primitive types distinct', () => {
    expect(partitionKey({ listId: 1 })).not.toBe(partitionKey({ listId: '1' }));
  });
});
