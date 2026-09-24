import { describe, expect, test } from 'vitest';

import {
  changedProjectDirs,
  projectFileStem,
  themedPath,
  themesFor,
} from '../index.js';

describe('changedProjectDirs', () => {
  const dirs = ['.', 'apps/docs', 'toolkits/kui-toolkit', 'toolkits/kui'];

  test('keeps the folders holding a changed path', () => {
    expect(
      changedProjectDirs(dirs.slice(1), [
        'toolkits/kui-toolkit/src/a.ts',
        'README.md',
      ]),
    ).toEqual(['toolkits/kui-toolkit']);
  });

  test('does not match a folder by name prefix', () => {
    expect(
      changedProjectDirs(['toolkits/kui'], ['toolkits/kui-toolkit/a.ts']),
    ).toEqual([]);
  });

  test('the root Project holds every changed path', () => {
    expect(changedProjectDirs(['.'], ['README.md'])).toEqual(['.']);
    expect(changedProjectDirs(['.'], [])).toEqual([]);
  });
});

describe('file names', () => {
  test('a Project folder becomes one stem', () => {
    expect(projectFileStem('toolkits/kui-toolkit', 'monorepo')).toBe(
      'toolkits%2Fkui-toolkit',
    );
    expect(projectFileStem('.', 'monorepo')).toBe('monorepo%2F');
  });

  test('different Project paths cannot collapse to one stem', () => {
    expect(projectFileStem('a/b-c', 'monorepo')).not.toBe(
      projectFileStem('a-b/c', 'monorepo'),
    );
    expect(projectFileStem('.', 'monorepo')).not.toBe(
      projectFileStem('monorepo', 'monorepo'),
    );
  });

  test('both themes suffix the file; one theme keeps it', () => {
    expect(themedPath('out/a.png', 'dark', 'both')).toBe('out/a-dark.png');
    expect(themedPath('out/a.png', 'light', 'light')).toBe('out/a.png');
    expect(themesFor('both')).toEqual(['dark', 'light']);
    expect(themesFor('light')).toEqual(['light']);
  });
});
