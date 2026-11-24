import {
  isWithin,
  rootRelative,
} from '../../../../../../../../../server/rpc/contract/index.js';
import { ancestorsOf } from '../../../../../../logic/shared/index.js';
import type { BrokenLink, Finding, Findings, TreePackage } from '../index.js';

/*
 * What the tree marks as wrong, worked out from its Props. In a Package,
 * the broken links are its Violations: each counts once, at the file
 * `monoverse lint` tells it on and every folder above it, the Package's
 * monoverse.json for what is wrong with that file itself. In the repo,
 * the broken links are a Package cycle's, and the Violations are each
 * Package's own, from its Check, counted at the Package and every folder
 * above it.
 */

/** Adds `count` to `path` and to every folder above it. */
function addUp(counts: Map<string, number>, path: string, count: number) {
  for (const at of [path, ...ancestorsOf(path)])
    counts.set(at, (counts.get(at) ?? 0) + count);
}

/** The Violations a Check found; none when it found none or did not run. */
const violationsOf = (check: TreePackage['check']) =>
  check._tag === 'Checked' ? check.violations : [];

/** `path` as seen from the Package folder `base`, relative to the root. */
const fromPackage = (base: string, path: string) =>
  base === ''
    ? path
    : path.startsWith(`${base}/`)
      ? path.slice(base.length + 1)
      : path;

/**
 * Where a finding is, from its Package, as `monoverse lint` says it:
 * `from:line:column → to`, without the line where none is known, or
 * without `to` for a finding in `from` alone.
 */
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

/** What the tree marks on each node, in a Package or in the repo. */
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

/**
 * What is wrong with the selection, each with what to do about it and
 * where, named from its Package: in a Package, the Violations of the
 * files it holds; in the repo, the cycle links it is part of, and the
 * Violations of the Packages it holds. `base` is the folder the tree
 * stands for.
 */
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
