import { describe, expect, it } from 'vitest';
import { windowKey } from '../index.js';

describe('window key', () => {
  it('is independent of field insertion order', () => {
    expect(windowKey({ status: 'open', archived: false })).toBe(
      windowKey({ archived: false, status: 'open' }),
    );
  });

  it('keeps values of different primitive types distinct', () => {
    expect(windowKey({ listId: 1 })).not.toBe(windowKey({ listId: '1' }));
  });
});
