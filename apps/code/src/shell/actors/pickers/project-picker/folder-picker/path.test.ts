import { describe, expect, it } from 'vitest';
import { walk } from './path.ts';

/*
 * A path typed in a folder Step goes to its folder, from home with `~/`
 * or from the folder open, and searches what follows the last `/`.
 */

describe('Folder paths', () => {
  it('names no folder without a `/`, or from `/`', () => {
    expect(walk('~', 'code')).toBeNull();
    expect(walk('~', '/Users/me/code')).toBeNull();
  });

  it('goes from home with `~/`, through each folder', () => {
    expect(walk('~/elsewhere', '~/code/fo')).toEqual({
      folders: [{ name: 'code', key: '~/code' }],
      query: 'fo',
    });
    expect(walk('~/code', '~/')).toEqual({ folders: [], query: '' });
  });

  it('goes from the folder open otherwise, up with `..`, never above home', () => {
    expect(walk('~/code', 'app/src/')).toEqual({
      folders: [
        { name: 'code', key: '~/code' },
        { name: 'app', key: '~/code/app' },
        { name: 'src', key: '~/code/app/src' },
      ],
      query: '',
    });
    expect(walk('~/code', '../../x')).toEqual({ folders: [], query: 'x' });
  });
});
