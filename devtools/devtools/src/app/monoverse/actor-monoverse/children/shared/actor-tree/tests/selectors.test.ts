import { describe, expect, test } from 'vitest';

import type { Check } from '../../../../../server/rpc/project/contract/index.js';
import { findingsOf, findingsWithin } from '../logic/shared/index.js';

/*
 * What the tree marks as wrong: in a Package, each Violation once, at the
 * file it is reported on and every folder above; in the repo, each Package's
 * Violations from its Check, and the Packages in a cycle apart, never
 * counted as Violations.
 */

const violation = (from: string, to: string) => ({
  from,
  to,
  message: `'${to}' is not a door.`,
});

describe('in a Package', () => {
  const broken = [
    violation('pkg/src/a/x.ts', 'pkg/src/b/y.ts'),
    violation('pkg/src/a/x.ts', 'pkg/src/c/z.ts'),
    violation('pkg/src/d.ts', 'pkg/src/b/y.ts'),
  ];

  test('each Violation counts once at its importer and every folder above it', () => {
    const { violations, cycles, checks } = findingsOf(broken, []);
    expect(violations.get('pkg/src/a/x.ts')).toBe(2);
    expect(violations.get('pkg/src/d.ts')).toBe(1);
    expect(violations.get('pkg/src/a')).toBe(2);
    expect(violations.get('pkg/src')).toBe(3);
    expect(violations.get('pkg')).toBe(3);
    // A file imported by a broken link holds none of its own.
    expect(violations.get('pkg/src/b/y.ts')).toBeUndefined();
    expect(cycles.size).toBe(0);
    expect(checks.size).toBe(0);
  });

  test('a finding without a link counts at its file, like any other', () => {
    const contract = { from: 'pkg/src/c.ts', message: 'No contract/.' };
    const { violations } = findingsOf([...broken, contract], []);
    expect(violations.get('pkg/src/c.ts')).toBe(1);
    expect(violations.get('pkg/src')).toBe(4);
  });

  test("a selection's findings are the Violations of the files it holds, named from the Package", () => {
    expect(findingsWithin('pkg/src/a', 'pkg', broken, [])).toEqual([
      { message: broken[0]?.message, where: 'src/a/x.ts → src/b/y.ts' },
      { message: broken[1]?.message, where: 'src/a/x.ts → src/c/z.ts' },
    ]);
    expect(findingsWithin('pkg/src/b', 'pkg', broken, [])).toEqual([]);
    expect(
      findingsWithin(
        'pkg',
        'pkg',
        [{ from: 'pkg/src/c.ts', message: 'm' }],
        [],
      ),
    ).toEqual([{ message: 'm', where: 'src/c.ts' }]);
  });
});

describe('in the repo', () => {
  const checked: Check = {
    _tag: 'Checked',
    violations: [
      {
        ...violation('devtools/app/src/a.ts', 'devtools/app/src/b.ts'),
        reason: 'door',
      },
      {
        ...violation('devtools/app/src/c.ts', 'devtools/app/src/b.ts'),
        reason: 'door',
      },
    ],
  };
  const packages = [
    { path: 'devtools/app', name: 'app', check: checked },
    {
      path: 'devtools/clean',
      name: 'clean',
      check: { _tag: 'Checked', violations: [] } as Check,
    },
    {
      path: 'packages/plain',
      name: 'plain',
      check: { _tag: 'Unchecked' } as Check,
    },
  ];
  const cycle = [
    {
      from: 'packages/plain',
      to: 'devtools/clean',
      message: 'In a Package cycle.',
    },
    {
      from: 'devtools/clean',
      to: 'packages/plain',
      message: 'In a Package cycle.',
    },
  ];

  test("each Package's Violations count at it and every folder above it; a cycle never does", () => {
    const { violations, cycles, checks } = findingsOf(cycle, packages);
    expect(violations.get('devtools/app')).toBe(2);
    expect(violations.get('devtools')).toBe(2);
    expect(violations.has('devtools/clean')).toBe(false);
    expect(violations.has('packages/plain')).toBe(false);
    expect(cycles.get('packages/plain')).toBe(1);
    expect(cycles.get('devtools/clean')).toBe(1);
    expect(cycles.get('devtools')).toBe(1);
    expect(checks.get('devtools/clean')).toEqual({
      _tag: 'Checked',
      violations: [],
    });
    expect(checks.get('packages/plain')).toEqual({ _tag: 'Unchecked' });
  });

  test("a selection's findings are its cycle links and the Violations of the Packages it holds", () => {
    const cycleFindings = [
      {
        message: 'In a Package cycle.',
        where: 'packages/plain → devtools/clean',
      },
      {
        message: 'In a Package cycle.',
        where: 'devtools/clean → packages/plain',
      },
    ];
    expect(findingsWithin('devtools/app', '', cycle, packages)).toHaveLength(2);
    expect(findingsWithin('devtools', '', cycle, packages)).toEqual([
      ...cycleFindings,
      {
        message: "'devtools/app/src/b.ts' is not a door.",
        where: 'app: src/a.ts → src/b.ts',
      },
      {
        message: "'devtools/app/src/b.ts' is not a door.",
        where: 'app: src/c.ts → src/b.ts',
      },
    ]);
    expect(findingsWithin('packages/plain', '', cycle, packages)).toEqual(
      cycleFindings,
    );
  });
});
