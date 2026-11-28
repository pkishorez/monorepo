import { describe, expect, test } from 'vitest';

import type { Link } from '../../../../../../../services/projects/contract/index.js';
import { linkKey, structureOf } from '../logic/shared/index.js';

const files = [
  'pkg/src/cli/serve/serve.ts',
  'pkg/src/cli/lint/lint.ts',
  'pkg/src/app/logic/shared/index.ts',
  'pkg/src/app/view/shared/index.ts',
  'pkg/src/app/children/actor-a/actor.ts',
  'pkg/src/app/children/actor-b/actor.ts',
  'pkg/src/app/server/index.ts',
];

const serve: Link = [
  'pkg/src/cli/serve/serve.ts',
  'pkg/src/app/server/index.ts',
];
const throughDoor: Link = [
  'pkg/src/app/children/actor-a/actor.ts',
  'pkg/src/app/logic/shared/index.ts',
];
const broken: Link = [
  'pkg/src/app/children/actor-b/actor.ts',
  'pkg/src/app/server/index.ts',
];
const links: ReadonlyArray<Link> = [serve, throughDoor, broken];

const kinds = {
  broken: new Set([linkKey(broken)]),
  excepted: new Set([linkKey(serve), linkKey(throughDoor)]),
  byException: new Set([linkKey(serve)]),
};

const excepted = [
  {
    from: throughDoor[0],
    to: throughDoor[1],
    line: 1,
    column: 1,
    by: 'door' as const,
    message: 'Through the door.',
  },
  {
    from: serve[0],
    to: serve[1],
    line: 1,
    column: 1,
    by: 'exception' as const,
    message: 'Let through.',
  },
];

const doors = ['pkg/src/app/logic/shared', 'pkg/src/app/view/shared'];

const structure = structureOf([], 'pkg', files, links, kinds, excepted, doors);

describe("a package's structure", () => {
  test('marks each folder that imports outside itself with the folders it reaches, and how', () => {
    expect(structure.reaches.get('pkg/src/cli/serve')).toEqual([
      { folder: 'pkg/src/app/server', by: 'exception' },
    ]);
    expect(structure.reaches.get('pkg/src/cli')).toEqual([
      { folder: 'pkg/src/app/server', by: 'exception' },
    ]);
    expect(structure.reaches.get('pkg/src/app/children')).toEqual([
      { folder: 'pkg/src/app/server', by: 'violation' },
      { folder: 'pkg/src/app/logic/shared', by: 'door' },
    ]);
    expect(structure.reaches.get('pkg/src/app/children/actor-a')).toEqual([
      { folder: 'pkg/src/app/logic/shared', by: 'door' },
    ]);
  });

  test('counts a reach at each folder it leaves, never above the folder holding both ends', () => {
    expect(structure.reaches.has('pkg/src/app')).toBe(false);
    expect(structure.reaches.has('pkg/src')).toBe(false);
  });

  test('keeps every other folder holding code as a leaf, and counts them all', () => {
    expect(structure.leaves).toEqual(
      new Set([
        'pkg/src',
        'pkg/src/app',
        'pkg/src/app/logic',
        'pkg/src/app/logic/shared',
        'pkg/src/app/view',
        'pkg/src/app/view/shared',
        'pkg/src/app/server',
        'pkg/src/cli/lint',
      ]),
    );
    expect(structure.folders).toBe(13);
  });

  test('credits an import only to the deepest door holding it', () => {
    const nested = structureOf([], 'pkg', files, links, kinds, excepted, [
      ...doors,
      'pkg/src/app',
    ]);
    expect(nested.doors.get('pkg/src/app/logic/shared')).toBe(1);
    expect(nested.doors.get('pkg/src/app')).toBe(0);
  });

  test('is empty for the tree of all packages', () => {
    const repo = structureOf(
      [{ path: 'pkg', name: 'pkg', check: { _tag: 'Unchecked' } }],
      '',
      files,
      links,
      kinds,
      excepted,
      doors,
    );
    expect(repo.folders).toBe(0);
    expect(repo.reaches.size).toBe(0);
  });

  test('counts the folders that come in through each door, and keeps an unused door at zero', () => {
    expect(structure.doors).toEqual(
      new Map([
        ['pkg/src/app/logic/shared', 1],
        ['pkg/src/app/view/shared', 0],
      ]),
    );
  });
});
