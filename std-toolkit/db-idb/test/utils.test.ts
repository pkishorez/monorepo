import { describe, expect, it } from 'vitest';
import { safeSpread } from '../src/utils.js';

describe('safeSpread', () => {
  it('should return object properties for valid objects', () => {
    const input = { name: 'John', age: 30 };
    const result = safeSpread(input);
    expect(result).toEqual({ name: 'John', age: 30 });
  });

  it('should return empty object for null', () => {
    const result = safeSpread(null);
    expect(result).toEqual({});
  });

  it('should return empty object for undefined', () => {
    const result = safeSpread(undefined);
    expect(result).toEqual({});
  });

  it('should return empty object for arrays', () => {
    const result = safeSpread([1, 2, 3]);
    expect(result).toEqual({});
  });

  it('should return empty object for primitive values', () => {
    expect(safeSpread('string')).toEqual({});
    expect(safeSpread(123)).toEqual({});
    expect(safeSpread(true)).toEqual({});
  });

  it('should handle nested objects', () => {
    const input = {
      user: { name: 'John', age: 30 },
      meta: { created: '2023-01-01' },
    };
    const result = safeSpread(input);
    expect(result).toEqual(input);
  });
});

