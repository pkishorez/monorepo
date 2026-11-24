import {
  isWithin,
  rootRelative,
} from '../../../../../../server/rpc/contract/index.js';
import type { Check } from '../../../../../../server/rpc/project/contract/index.js';
import { ancestorsOf } from '../../../../../logic/shared/index.js';
import type { BrokenLink } from './shape.js';

/*
 * What the tree marks as wrong, worked out from its Props. In a Package,
 * the broken links are its Violations: each counts once, at the file that
 * imports and every folder above it, as `vp lint` counts them. In the
 * repo, the broken links are a Package cycle's, and the Violations are
 * each Package's own, from its Check, counted at the Package and every
 * folder above it.
 */

/** A Package as the tree draws it: its folder, and its Check. */
export interface CheckedPackage {
  readonly path: string;
  readonly check: Check;
}

/** What the tree marks on each node. */
export interface Findings {
  /** How many Violations each node holds. */
  readonly violations: ReadonlyMap<string, number>;
  /** How many Packages in a cycle each node holds; only in the repo. */
  readonly cycles: ReadonlyMap<string, number>;
  /** Each Package's Check, by its folder; only in the repo. */
  readonly checks: ReadonlyMap<string, Check>;
}

/** Adds `count` to `path` and to every folder above it. */
function addUp(counts: Map<string, number>, path: string, count: number) {
  for (const at of [path, ...ancestorsOf(path)])
    counts.set(at, (counts.get(at) ?? 0) + count);
}

/** The Violations a Check found; none when it found none or did not run. */
export const violationsOf = (check: Check) =>
  check._tag === 'Checked' ? check.violations : [];

/** What the tree marks on each node, in a Package or in the repo. */
export function findingsOf(
  broken: ReadonlyArray<BrokenLink>,
  packages: ReadonlyArray<CheckedPackage>,
): Findings {
  const violations = new Map<string, number>();
  const cycles = new Map<string, number>();
  const checks = new Map<string, Check>();
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
 * What is wrong with the selection, each with what to do about it: in a
 * Package, the Violations of the files it holds; in the repo, the cycle
 * links it is part of, and the Violations of the Packages it holds.
 */
export function findingsWithin(
  selected: string,
  broken: ReadonlyArray<BrokenLink>,
  packages: ReadonlyArray<CheckedPackage>,
): ReadonlyArray<BrokenLink> {
  if (packages.length === 0)
    return broken.filter(({ from }) => isWithin(from, selected));
  const cycle = broken.filter(
    ({ from, to }) => isWithin(from, selected) || isWithin(to, selected),
  );
  const held = packages
    .filter(({ path }) => isWithin(rootRelative(path), selected))
    .flatMap(({ check }) => violationsOf(check));
  return [...cycle, ...held];
}
