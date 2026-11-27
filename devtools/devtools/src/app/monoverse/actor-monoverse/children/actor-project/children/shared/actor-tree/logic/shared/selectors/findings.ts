import {
  isWithin,
  rootRelative,
} from '../../../../../../../../../server/rpc/contract/index.js';
import { ancestorsOf } from '../../../../../../logic/shared/index.js';
import type {
  BrokenLink,
  ExceptedLink,
  Finding,
  Findings,
  SelectionFindings,
  TreePackage,
} from '../index.js';

function addUp(counts: Map<string, number>, path: string, count: number) {
  for (const at of [path, ...ancestorsOf(path)])
    counts.set(at, (counts.get(at) ?? 0) + count);
}

const violationsOf = (check: TreePackage['check']) =>
  check._tag === 'Checked' ? check.violations : [];

const exceptedOf = (check: TreePackage['check']) =>
  check._tag === 'Checked' ? check.excepted : [];

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
  excepted: ReadonlyArray<ExceptedLink>,
  packages: ReadonlyArray<TreePackage>,
): Findings {
  const violations = new Map<string, number>();
  const exceptions = new Map<string, number>();
  const cycles = new Map<string, number>();
  const checks = new Map<string, TreePackage['check']>();
  if (packages.length === 0) {
    for (const { from } of broken) addUp(violations, from, 1);
    for (const { from } of excepted) addUp(exceptions, from, 1);
    return { violations, excepted: exceptions, cycles, checks };
  }
  for (const { path, check } of packages) {
    const at = rootRelative(path);
    checks.set(at, check);
    const count = violationsOf(check).length;
    if (count > 0) addUp(violations, at, count);
    const through = exceptedOf(check).length;
    if (through > 0) addUp(exceptions, at, through);
  }
  for (const from of new Set(broken.map(({ from }) => from)))
    addUp(cycles, from, 1);
  return { violations, excepted: exceptions, cycles, checks };
}

export function findingsWithin(
  selected: string,
  base: string,
  broken: ReadonlyArray<BrokenLink>,
  excepted: ReadonlyArray<ExceptedLink>,
  packages: ReadonlyArray<TreePackage>,
): SelectionFindings {
  const listed = (links: ReadonlyArray<BrokenLink>): ReadonlyArray<Finding> =>
    links
      .filter(({ from }) => isWithin(from, selected))
      .map((link) => ({ message: link.message, where: whereOf(base, link) }));
  if (packages.length === 0)
    return { violations: listed(broken), excepted: listed(excepted) };
  const cycle = broken
    .filter(
      ({ from, to }) =>
        isWithin(from, selected) ||
        (to !== undefined && isWithin(to, selected)),
    )
    .map((link) => ({ message: link.message, where: whereOf('', link) }));
  const held = packages.filter(({ path }) =>
    isWithin(rootRelative(path), selected),
  );
  const named = (
    name: string,
    path: string,
    link: Omit<BrokenLink, 'message'> & { readonly message: string },
  ): Finding => ({
    message: link.message,
    where: `${name}: ${whereOf(rootRelative(path), link)}`,
  });
  return {
    violations: [
      ...cycle,
      ...held.flatMap(({ path, name, check }) =>
        violationsOf(check).map((link) => named(name, path, link)),
      ),
    ],
    excepted: held.flatMap(({ path, name, check }) =>
      exceptedOf(check).map((link) => named(name, path, link)),
    ),
  };
}
