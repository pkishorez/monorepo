import { describe, expect, it } from 'vitest';
import { clean } from './title.js';

describe('clean', () => {
  it('keeps the first line, without quotes, markdown or unprintable characters', () => {
    expect(clean('**"Haiku Greeting and Image Color \u{5FFFF}"**\nmore')).toBe(
      'Haiku Greeting and Image Color',
    );
  });

  it('cuts the title to six words', () => {
    expect(clean('one two three four five six seven')).toBe(
      'one two three four five six',
    );
  });
});
