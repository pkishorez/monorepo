import { describe, expect, test } from 'vitest';
import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

import { planSnapshot } from '../index.js';

// planSnapshot reads only Module membership and the Module count.
const analysis = {
  moduleAnalysis: {
    modules: [{}, {}, {}],
    membership: new Map([
      ['src/a/index.ts', 'src/a'],
      ['src/a/a.ts', 'src/a'],
      ['src/b.ts', 'src/b.ts'],
    ]),
  },
} as unknown as ArchitectureAnalysis;

const file = (path: string, committed: boolean, uncommitted: boolean) => ({
  path,
  status: 'modified' as const,
  committed,
  uncommitted,
});

const changeSet = (...files: ChangeSet['files']): ChangeSet => ({
  baseRef: 'abc',
  files,
});

const draw = { includeUnchanged: false, onlyChanged: false };

describe('planSnapshot', () => {
  test('marks committed changes and draws the changed Modules', () => {
    const plan = planSnapshot(
      analysis,
      changeSet(
        file('src/a/index.ts', true, false),
        file('src/a/a.ts', true, true),
        file('src/b.ts', false, true),
      ),
      draw,
    );
    expect(plan.changes.files.map(({ path }) => path)).toEqual([
      'src/a/index.ts',
      'src/a/a.ts',
    ]);
    expect(plan).toMatchObject({
      modules: 3,
      changedModules: 1,
      drawn: 'changed',
    });
  });

  test('draws every Module when asked, or when nothing was committed', () => {
    const committed = changeSet(file('src/b.ts', true, false));
    const uncommitted = changeSet(file('src/b.ts', false, true));
    expect(
      planSnapshot(analysis, committed, { ...draw, includeUnchanged: true })
        .drawn,
    ).toBe('all');
    expect(planSnapshot(analysis, uncommitted, draw)).toMatchObject({
      changedModules: 0,
      drawn: 'all',
    });
  });

  test('draws nothing when only changes are wanted and none were committed', () => {
    expect(
      planSnapshot(analysis, changeSet(), { ...draw, onlyChanged: true }).drawn,
    ).toBe('none');
  });
});
