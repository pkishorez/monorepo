import { describe, expect, test } from 'vitest';

import type { Check } from '../../../../../../../server/rpc/project/contract/index.js';
import { findingsOf, findingsWithin } from '../logic/shared/index.js';

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
    const { violations, cycles, checks } = findingsOf(broken, [], []);
    expect(violations.get('pkg/src/a/x.ts')).toBe(2);
    expect(violations.get('pkg/src/d.ts')).toBe(1);
    expect(violations.get('pkg/src/a')).toBe(2);
    expect(violations.get('pkg/src')).toBe(3);
    expect(violations.get('pkg')).toBe(3);
    expect(violations.get('pkg/src/b/y.ts')).toBeUndefined();
    expect(cycles.size).toBe(0);
    expect(checks.size).toBe(0);
  });

  test('a finding without a link counts at its file, like any other', () => {
    const contract = { from: 'pkg/src/c.ts', message: 'No contract/.' };
    const { violations } = findingsOf([...broken, contract], [], []);
    expect(violations.get('pkg/src/c.ts')).toBe(1);
    expect(violations.get('pkg/src')).toBe(4);
  });

  test("a selection's findings are the Violations of the files it holds, named from the Package", () => {
    expect(
      findingsWithin('pkg/src/a', 'pkg', broken, [], []).violations,
    ).toEqual([
      { message: broken[0]?.message, where: 'src/a/x.ts → src/b/y.ts' },
      { message: broken[1]?.message, where: 'src/a/x.ts → src/c/z.ts' },
    ]);
    expect(
      findingsWithin('pkg/src/b', 'pkg', broken, [], []).violations,
    ).toEqual([]);
    expect(
      findingsWithin(
        'pkg',
        'pkg',
        [{ from: 'pkg/src/c.ts', message: 'm' }],
        [],
        [],
      ).violations,
    ).toEqual([{ message: 'm', where: 'src/c.ts' }]);
  });

  test('each excepted import counts at its importer and every folder above it, and lists apart from the Violations', () => {
    const excepted = [
      {
        from: 'pkg/src/a/x.ts',
        to: 'pkg/src/shared/index.ts',
        line: 2,
        column: 20,
        message: "'../shared/index.ts' comes in through the door src/shared.",
      },
    ];
    const findings = findingsOf(broken, excepted, []);
    expect(findings.excepted.get('pkg/src/a/x.ts')).toBe(1);
    expect(findings.excepted.get('pkg')).toBe(1);
    expect(findings.violations.get('pkg')).toBe(3);
    expect(findingsWithin('pkg/src/a', 'pkg', broken, excepted, [])).toEqual({
      violations: [
        { message: broken[0]?.message, where: 'src/a/x.ts → src/b/y.ts' },
        { message: broken[1]?.message, where: 'src/a/x.ts → src/c/z.ts' },
      ],
      excepted: [
        {
          message: excepted[0]?.message,
          where: 'src/a/x.ts:2:20 → src/shared/index.ts',
        },
      ],
    });
  });

  test('what is wrong with the monoverse.json counts on it, rolls up, and says where in it', () => {
    const unused = {
      from: 'pkg/monoverse.json',
      line: 7,
      column: 5,
      message: "The exception from 'src/x' lets no import through.",
    };
    const { violations } = findingsOf([...broken, unused], [], []);
    expect(violations.get('pkg/monoverse.json')).toBe(1);
    expect(violations.get('pkg')).toBe(4);
    expect(
      findingsWithin('pkg/monoverse.json', 'pkg', [unused], [], []).violations,
    ).toEqual([{ message: unused.message, where: 'monoverse.json:7:5' }]);
  });
});

describe('in the repo', () => {
  const checked: Check = {
    _tag: 'Checked',
    excepted: [
      {
        from: 'devtools/app/src/a.ts',
        to: 'devtools/app/src/shared/index.ts',
        line: 1,
        column: 1,
        by: 'door',
        message: 'Through the door src/shared.',
      },
    ],
    violations: [
      {
        ...violation('devtools/app/src/a.ts', 'devtools/app/src/b.ts'),
        line: 3,
        column: 8,
        reason: 'door',
      },
      {
        ...violation('devtools/app/src/c.ts', 'devtools/app/src/b.ts'),
        line: 1,
        column: 22,
        reason: 'door',
      },
    ],
  };
  const packages = [
    { path: 'devtools/app', name: 'app', check: checked },
    {
      path: 'devtools/clean',
      name: 'clean',
      check: { _tag: 'Checked', violations: [], excepted: [] } as Check,
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
    const { violations, cycles, checks } = findingsOf(cycle, [], packages);
    expect(violations.get('devtools/app')).toBe(2);
    expect(violations.get('devtools')).toBe(2);
    expect(findingsOf(cycle, [], packages).excepted.get('devtools')).toBe(1);
    expect(violations.has('devtools/clean')).toBe(false);
    expect(violations.has('packages/plain')).toBe(false);
    expect(cycles.get('packages/plain')).toBe(1);
    expect(cycles.get('devtools/clean')).toBe(1);
    expect(cycles.get('devtools')).toBe(1);
    expect(checks.get('devtools/clean')).toEqual({
      _tag: 'Checked',
      excepted: [],
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
    expect(
      findingsWithin('devtools/app', '', cycle, [], packages).violations,
    ).toHaveLength(2);
    expect(
      findingsWithin('devtools', '', cycle, [], packages).violations,
    ).toEqual([
      ...cycleFindings,
      {
        message: "'devtools/app/src/b.ts' is not a door.",
        where: 'app: src/a.ts:3:8 → src/b.ts',
      },
      {
        message: "'devtools/app/src/b.ts' is not a door.",
        where: 'app: src/c.ts:1:22 → src/b.ts',
      },
    ]);
    expect(
      findingsWithin('packages/plain', '', cycle, [], packages).violations,
    ).toEqual(cycleFindings);
  });
});
