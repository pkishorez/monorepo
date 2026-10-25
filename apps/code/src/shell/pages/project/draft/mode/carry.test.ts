import { describe, expect, it } from 'vitest';
import { btwQuestion, btwSearched } from './btw.ts';

describe('btwQuestion', () => {
  it('is the rest of a draft that starts with /btw', () => {
    expect(btwQuestion('/btw what changed?')).toBe('what changed?');
    expect(btwQuestion('  /btw   why\nthis file? ')).toBe('why\nthis file?');
    expect(btwQuestion('/btw\nwhich test failed')).toBe('which test failed');
  });

  it('is empty when /btw names no question', () => {
    expect(btwQuestion('/btw')).toBe('');
    expect(btwQuestion('/btw   ')).toBe('');
  });

  it('is null for any other message', () => {
    expect(btwQuestion('fix the bug')).toBeNull();
    expect(btwQuestion('/btwx hi')).toBeNull();
    expect(btwQuestion('see /btw later')).toBeNull();
    expect(btwQuestion('/review the diff')).toBeNull();
  });
});

describe('btwSearched', () => {
  it('is what follows `btw` and a space in the skills Picker', () => {
    expect(btwSearched('btw ')).toBe('');
    expect(btwSearched('btw what is this?')).toBe('what is this?');
  });

  it('is null for any other search', () => {
    expect(btwSearched('btw')).toBeNull();
    expect(btwSearched('btwx')).toBeNull();
    expect(btwSearched('review')).toBeNull();
  });
});
