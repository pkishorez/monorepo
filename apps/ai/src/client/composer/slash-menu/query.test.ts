import { describe, expect, it } from 'vitest';
import { slashQuery } from './query.ts';

describe('slashQuery', () => {
  it('finds a slash at the start of the line', () => {
    expect(slashQuery('/rev')).toEqual({ from: 0, query: 'rev' });
  });

  it('finds a slash after a space', () => {
    expect(slashQuery('please /')).toEqual({ from: 7, query: '' });
  });

  it('takes names with colons, dots and dashes', () => {
    expect(slashQuery('run /plugin:deep-module.v2')).toEqual({
      from: 4,
      query: 'plugin:deep-module.v2',
    });
  });

  it('ignores a slash inside a word or a path', () => {
    expect(slashQuery('a/b')).toBeNull();
    expect(slashQuery('see http://x')).toBeNull();
    expect(slashQuery('/usr/lo')).toBeNull();
  });

  it('closes once a space follows the name', () => {
    expect(slashQuery('/review ')).toBeNull();
  });
});
