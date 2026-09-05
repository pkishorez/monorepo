import { describe, expect, it } from 'vitest';
import { encodeCompositeKey } from '../index.js';

describe('encodeCompositeKey', () => {
  it('is deterministic and collision-safe', () => {
    expect(encodeCompositeKey(['a', 'b'])).toBe(encodeCompositeKey(['a', 'b']));
    expect(encodeCompositeKey(['a#b', 'c'])).not.toBe(
      encodeCompositeKey(['a', 'b#c']),
    );
    expect(encodeCompositeKey(['a#', 'b'])).not.toBe(
      encodeCompositeKey(['a', '#b']),
    );
    expect(encodeCompositeKey(['a\\', 'b'])).not.toBe(
      encodeCompositeKey(['a', '\\b']),
    );
    expect(encodeCompositeKey(['', 'ab'])).not.toBe(
      encodeCompositeKey(['a', 'b']),
    );
    expect(encodeCompositeKey(['', ''])).not.toBe(encodeCompositeKey(['']));
    expect(encodeCompositeKey(['🙂', 'नमस्ते'])).not.toBe(
      encodeCompositeKey(['🙂नमस्ते']),
    );
  });

  it('joins components a person can read', () => {
    expect(encodeCompositeKey(['Order', '01H2X'])).toBe('Order#01H2X');
  });

  it('keeps a semantic prefix a physical prefix', () => {
    expect(
      encodeCompositeKey(['2024-01-05']).startsWith(
        encodeCompositeKey(['2024']),
      ),
    ).toBe(true);
    expect(
      encodeCompositeKey(['a', 'bc']).startsWith(
        encodeCompositeKey(['a', 'b']),
      ),
    ).toBe(true);
  });

  it('preserves component sort order', () => {
    expect(encodeCompositeKey(['a']) < encodeCompositeKey(['aa'])).toBe(true);
    expect(encodeCompositeKey(['aa']) < encodeCompositeKey(['z'])).toBe(true);
    expect(
      encodeCompositeKey(['a', 'b']) < encodeCompositeKey(['a', 'c']),
    ).toBe(true);
  });
});
