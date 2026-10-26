import { describe, expect, it } from 'vitest';
import { carriedQuestion } from './carry.ts';

describe('carriedQuestion', () => {
  it('is the rest of a draft that starts with /btw', () => {
    expect(carriedQuestion('/btw what changed?')).toBe('what changed?');
    expect(carriedQuestion('  /btw   why\nthis file? ')).toBe(
      'why\nthis file?',
    );
    expect(carriedQuestion('/btw\nwhich test failed')).toBe(
      'which test failed',
    );
  });

  it('is empty when /btw names no question', () => {
    expect(carriedQuestion('/btw')).toBe('');
    expect(carriedQuestion('/btw   ')).toBe('');
  });

  it('is null for any other message', () => {
    expect(carriedQuestion('fix the bug')).toBeNull();
    expect(carriedQuestion('/btwx hi')).toBeNull();
    expect(carriedQuestion('see /btw later')).toBeNull();
    expect(carriedQuestion('/review the diff')).toBeNull();
  });
});
