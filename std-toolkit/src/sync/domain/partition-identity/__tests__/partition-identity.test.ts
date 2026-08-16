import { describe, expect, it } from 'vitest';
import { serializePartition } from '../index.js';

describe('partition identity', () => {
  it('is independent of field insertion order', () => {
    expect(serializePartition({ status: 'open', archived: false })).toBe(
      serializePartition({ archived: false, status: 'open' }),
    );
  });

  it('keeps values of different primitive types distinct', () => {
    expect(serializePartition({ listId: 1 })).not.toBe(
      serializePartition({ listId: '1' }),
    );
  });
});
