import { describe, expect, it } from 'vitest';
import { searchedQuestion } from './skills.ts';

describe('searchedQuestion', () => {
  it('is what follows `btw` and a space in the skills Picker', () => {
    expect(searchedQuestion('btw ')).toBe('');
    expect(searchedQuestion('btw what is this?')).toBe('what is this?');
  });

  it('is null for any other search', () => {
    expect(searchedQuestion('btw')).toBeNull();
    expect(searchedQuestion('btwx')).toBeNull();
    expect(searchedQuestion('review')).toBeNull();
  });
});
