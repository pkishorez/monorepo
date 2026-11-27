import {
  isWithin,
  rootRelative,
} from '../../../../../../../../../server/rpc/contract/index.js';
import { ancestorsOf } from '../../../../../../logic/shared/index.js';
import type { BrokenLink, Finding, Findings, TreePackage } from '../index.js';

function addUp(counts: Map<string, number>, path: string, count: number) {
  for (const at of [path, ...ancestorsOf(path)])
    counts.set(at, (counts.get(at) ?? 0) + count);
}

const violationsOf = (check: TreePackage['check']) =>
  check._tag === 'Checked' ? check.violations : [];

const fromPackage = (base: string, path: string) =>
  base === ''
    ? path
    : path.startsWith(`${base}/`)
      ? path.slice(base.length + 1)
      : path;

const whereOf = (
  base: string,
  { from, to, line, column }: Omit<BrokenLink, 'message'>,
) => {
  const at =
    line === undefined
      ? fromPackage(base, from)
      : `${fromPackage(base, from)}:${line}:${column ?? 1}`;
  return to === undefined ? at : `${at} → ${fromPackage(base, to)}`;
};

export function findingsOf(
  broken: ReadonlyArray<BrokenLink>,
  packages: ReadonlyArray<TreePackage>,
): Findings {
  const violations = new Map<string, number>();
  const cycles = new Map<string, number>();
  const checks = new Map<string, TreePackage['check']>();
  if (packages.length === 0) {
    for (const { from } of broken) addUp(violations, from, 1);
    return { violations, cycles, checks };
  }
  for (const { path, check } of packages) {
    const at = rootRelative(path);
    checks.set(at, check);
    const count = violationsOf(check).length;
    if (count > 0) addUp(violations, at, count);
  }
  for (const from of new Set(broken.map(({ from }) => from)))
    addUp(cycles, from, 1);
  return { violations, cycles, checks };
}

export function findingsWithin(
  selected: string,
  base: string,
  broken: ReadonlyArray<BrokenLink>,
  packages: ReadonlyArray<TreePackage>,
): ReadonlyArray<Finding> {
  if (packages.length === 0)
    return broken
      .filter(({ from }) => isWithin(from, selected))
      .map((link) => ({ message: link.message, where: whereOf(base, link) }));
  const cycle = broken
    .filter(
      ({ from, to }) =>
        isWithin(from, selected) ||
        (to !== undefined && isWithin(to, selected)),
    )
    .map((link) => ({ message: link.message, where: whereOf('', link) }));
  const held = packages
    .filter(({ path }) => isWithin(rootRelative(path), selected))
    .flatMap(({ path, name, check }) =>
      violationsOf(check).map((violation) => ({
        message: violation.message,
        where: `${name}: ${whereOf(rootRelative(path), violation)}`,
      })),
    );
  return [...cycle, ...held];
}
