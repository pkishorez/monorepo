import { describe, expect, test } from 'vitest';

import type { Link } from '../../../../../../../services/projects/contract/index.js';
import {
  buildTree,
  focusedTree,
  opensAround,
  trailOf,
  visibleOf,
} from '../logic/shared/index.js';
import {
  connectionsOf,
  focusedFiles,
  foldersAround,
  foldersToReveal,
  leavesOf,
  linkKey,
  shownLinks,
} from '../logic/shared/index.js';

const files = [
  'src/app/feed/actor.ts',
  'src/app/feed/rows/row.ts',
  'src/app/list/actor.ts',
  'src/app/index.ts',
  'src/cli/main.ts',
  'src/cli/serve/serve.ts',
];

const tree = buildTree(
  '',
  files.map((path) => ({ path, kind: 'file' as const })),
);

const links: ReadonlyArray<Link> = [
  ['src/app/feed/actor.ts', 'src/app/feed/rows/row.ts'],
  ['src/app/feed/actor.ts', 'src/app/list/actor.ts'],
  ['src/app/feed/rows/row.ts', 'src/app/index.ts'],
  ['src/cli/serve/serve.ts', 'src/app/feed/actor.ts'],
  ['src/cli/main.ts', 'src/app/index.ts'],
  ['src/app/list/actor.ts', 'src/app/feed/rows/row.ts'],
];

const kinds = {
  broken: new Set([linkKey(['src/app/feed/rows/row.ts', 'src/app/index.ts'])]),
  excepted: new Set([
    linkKey(['src/cli/serve/serve.ts', 'src/app/feed/actor.ts']),
  ]),
  byException: new Set<string>(),
};

const connections = (selected: string, open: ReadonlyArray<string>) => {
  const isOpen = (path: string) => open.includes(path);
  return Object.fromEntries(
    connectionsOf(
      selected,
      links,
      (path) => visibleOf(tree, isOpen, path),
      kinds,
    ),
  );
};

describe('connections, rolled up to the tree as drawn', () => {
  test('a folder connects to its siblings and to things beside its ancestors, never inside itself', () => {
    expect(connections('src/app/feed', ['src', 'src/app'])).toEqual({
      'src/app/list': { uses: 1, usedBy: 1, broken: 0, excepted: 0 },
      'src/app/index.ts': { uses: 1, usedBy: 0, broken: 1, excepted: 0 },
      'src/cli': { uses: 0, usedBy: 1, broken: 0, excepted: 1 },
    });
  });

  test('a closed folder stands for what is inside it, with a count', () => {
    expect(connections('src/app/index.ts', ['src', 'src/app'])).toEqual({
      'src/app/feed': { uses: 0, usedBy: 1, broken: 1, excepted: 0 },
      'src/cli': { uses: 0, usedBy: 1, broken: 0, excepted: 0 },
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
      'src/app/feed/rows': { uses: 0, usedBy: 1, broken: 1, excepted: 0 },
      'src/cli/main.ts': { uses: 0, usedBy: 1, broken: 0, excepted: 0 },
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
      'src/app/feed/actor.ts': { uses: 0, usedBy: 1, broken: 0, excepted: 0 },
      'src/app/list': { uses: 0, usedBy: 1, broken: 0, excepted: 0 },
      'src/app/index.ts': { uses: 1, usedBy: 0, broken: 1, excepted: 0 },
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

describe('which connections are drawn', () => {
  test('only the kinds chosen are drawn, and all of them to start with', () => {
    const all = { violations: true, exceptions: true, allowed: true };
    expect(shownLinks(links, kinds, all)).toBe(links);
    expect(
      shownLinks(links, kinds, { ...all, violations: false, allowed: false }),
    ).toEqual([['src/cli/serve/serve.ts', 'src/app/feed/actor.ts']]);
    expect(
      shownLinks(links, kinds, { ...all, exceptions: false, allowed: false }),
    ).toEqual([['src/app/feed/rows/row.ts', 'src/app/index.ts']]);
    expect(
      shownLinks(links, kinds, {
        violations: false,
        exceptions: false,
        allowed: false,
      }),
    ).toEqual([]);
  });
});

describe('a leaf folder', () => {
  test('imports nothing outside itself', () => {
    expect(leavesOf('', files, links)).toEqual(new Set(['src', 'src/app']));
    expect(
      leavesOf(
        'pkg',
        ['pkg/src/a/x.ts', 'pkg/src/b/y.ts', 'pkg/src/b/deep/z.ts'],
        [
          ['pkg/src/a/x.ts', 'pkg/src/b/y.ts'],
          ['pkg/src/b/y.ts', 'pkg/src/b/deep/z.ts'],
        ],
      ),
    ).toEqual(new Set(['pkg/src', 'pkg/src/b', 'pkg/src/b/deep']));
  });

  test('is one even when nothing imports it', () => {
    expect(
      leavesOf('pkg', ['pkg/src/main.ts', 'pkg/scripts/build.ts'], []),
    ).toEqual(new Set(['pkg/src', 'pkg/scripts']));
  });

  test('is never the package itself, nor a folder without source files', () => {
    expect(
      leavesOf(
        'pkg',
        ['pkg/src/x.ts', 'pkg/lib/y.ts', 'pkg/docs/guide.md'],
        [['pkg/src/x.ts', 'pkg/lib/y.ts']],
      ),
    ).toEqual(new Set(['pkg/lib']));
  });
});

describe('one folder shown alone', () => {
  test('holds its own files, then the outside files it connects to', () => {
    expect(focusedFiles('src/app/feed', files, links, true)).toEqual([
      'src/app/feed/actor.ts',
      'src/app/feed/rows/row.ts',
      'src/app/list/actor.ts',
      'src/app/index.ts',
      'src/cli/serve/serve.ts',
    ]);
  });

  test('holds only its own files once the outside folders are hidden', () => {
    expect(focusedFiles('src/app/feed', files, links, false)).toEqual([
      'src/app/feed/actor.ts',
      'src/app/feed/rows/row.ts',
    ]);
  });

  test('is drawn from the top with the outside files it connects to, or as the top itself', () => {
    const leaves = files.map((path) => ({ path, kind: 'file' as const }));
    const around = focusedTree(tree, leaves, 'src/app/feed', links, true);
    expect([...around.nodes.keys()].sort()).toEqual(
      [
        '',
        'src',
        'src/app',
        'src/app/feed',
        'src/app/feed/actor.ts',
        'src/app/feed/rows',
        'src/app/feed/rows/row.ts',
        'src/app/index.ts',
        'src/app/list',
        'src/app/list/actor.ts',
        'src/cli',
        'src/cli/serve',
        'src/cli/serve/serve.ts',
      ].sort(),
    );
    const alone = focusedTree(tree, leaves, 'src/app/feed', links, false);
    expect(alone.root.path).toBe('src/app/feed');
    expect(focusedTree(tree, leaves, null, links, true)).toBe(tree);
  });

  test('keeps the folders above it open, and leaves the outside ones to the user', () => {
    const open = opensAround('src/app/feed', true);
    expect(['src', 'src/app', 'src/app/feed'].map(open)).toEqual([
      true,
      true,
      true,
    ]);
    expect(['src/cli', 'src/app/list', 'src/app/feed/rows'].map(open)).toEqual([
      false,
      false,
      false,
    ]);
    expect(opensAround('src/app/feed', false)('src')).toBe(false);
  });

  test('opens, when first shown, the outside folders that hold what it connects to', () => {
    expect(foldersAround('src/app/feed', '', links)).toEqual([
      'src',
      'src/app',
      'src/app/list',
      'src/cli',
      'src/cli/serve',
    ]);
  });

  test('is named by a trail from the top, each step a way back up', () => {
    expect(trailOf(tree, 'src/app/feed', 'repo')).toEqual([
      { path: null, name: 'repo' },
      { path: 'src', name: 'src' },
      { path: 'src/app', name: 'app' },
      { path: 'src/app/feed', name: 'feed' },
    ]);
  });
});
