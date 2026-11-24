import { describe, expect, test } from 'vitest';

import type { Link } from '../../../../../../../services/projects/contract/index.js';
import { buildTree, visibleOf } from '../logic/shared/index.js';
import {
  connectionsOf,
  foldersToReveal,
  linkKey,
} from '../logic/shared/index.js';

/*
 * src/
 *   app/
 *     feed/   actor.ts  rows/row.ts
 *     list/   actor.ts
 *     index.ts
 *   cli/      main.ts   serve/serve.ts
 */
const tree = buildTree(
  '',
  [
    'src/app/feed/actor.ts',
    'src/app/feed/rows/row.ts',
    'src/app/list/actor.ts',
    'src/app/index.ts',
    'src/cli/main.ts',
    'src/cli/serve/serve.ts',
  ].map((path) => ({ path, kind: 'file' as const })),
);

const links: ReadonlyArray<Link> = [
  ['src/app/feed/actor.ts', 'src/app/feed/rows/row.ts'],
  ['src/app/feed/actor.ts', 'src/app/list/actor.ts'],
  ['src/app/feed/rows/row.ts', 'src/app/index.ts'],
  ['src/cli/serve/serve.ts', 'src/app/feed/actor.ts'],
  ['src/cli/main.ts', 'src/app/index.ts'],
  ['src/app/list/actor.ts', 'src/app/feed/rows/row.ts'],
];

const connections = (selected: string, open: ReadonlyArray<string>) => {
  const isOpen = (path: string) => open.includes(path);
  return Object.fromEntries(
    connectionsOf(
      selected,
      links,
      (path) => visibleOf(tree, isOpen, path),
      new Set([linkKey(['src/app/feed/rows/row.ts', 'src/app/index.ts'])]),
    ),
  );
};

describe('connections, rolled up to the tree as drawn', () => {
  test('a folder connects to its siblings and to things beside its ancestors, never inside itself', () => {
    expect(connections('src/app/feed', ['src', 'src/app'])).toEqual({
      'src/app/list': { uses: 1, usedBy: 1, broken: 0 },
      'src/app/index.ts': { uses: 1, usedBy: 0, broken: 1 },
      'src/cli': { uses: 0, usedBy: 1, broken: 0 },
    });
  });

  test('a closed folder stands for what is inside it, with a count', () => {
    expect(connections('src/app/index.ts', ['src', 'src/app'])).toEqual({
      'src/app/feed': { uses: 0, usedBy: 1, broken: 1 },
      'src/cli': { uses: 0, usedBy: 1, broken: 0 },
    });
  });

  test('opening a folder lands each link on what is inside it', () => {
    expect(
      connections('src/app/index.ts', [
        'src',
        'src/app',
        'src/app/feed',
        'src/cli',
      ]),
    ).toEqual({
      'src/app/feed/rows': { uses: 0, usedBy: 1, broken: 1 },
      'src/cli/main.ts': { uses: 0, usedBy: 1, broken: 0 },
    });
  });

  test('a file connects the same way', () => {
    expect(
      connections('src/app/feed/rows/row.ts', [
        'src',
        'src/app',
        'src/app/feed',
        'src/app/feed/rows',
      ]),
    ).toEqual({
      'src/app/feed/actor.ts': { uses: 0, usedBy: 1, broken: 0 },
      'src/app/list': { uses: 0, usedBy: 1, broken: 0 },
      'src/app/index.ts': { uses: 1, usedBy: 0, broken: 1 },
    });
  });

  test('the top folder holding every link has none', () => {
    expect(connections('src', ['src'])).toEqual({});
  });

  test('a closed folder that lights up opens down to what it holds that connects', () => {
    expect(foldersToReveal('src/app', 'src/cli', links)).toEqual([
      'src/app',
      'src/app/feed',
    ]);
    expect(foldersToReveal('src/app/feed', 'src/app/index.ts', links)).toEqual([
      'src/app/feed',
      'src/app/feed/rows',
    ]);
  });
});
