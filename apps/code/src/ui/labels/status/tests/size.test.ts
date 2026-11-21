import { describe, expect, it } from 'vitest';
import { size } from '../index.ts';

describe('size', () => {
  it('reads as a person would', () => {
    expect(size(200)).toBe('1 KB');
    expect(size(52_300)).toBe('52 KB');
    expect(size(18_400_000)).toBe('18.4 MB');
    expect(size(2_100_000_000)).toBe('2.1 GB');
  });
});
