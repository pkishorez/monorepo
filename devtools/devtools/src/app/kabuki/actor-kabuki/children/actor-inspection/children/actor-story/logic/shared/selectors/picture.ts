import type { Plan } from '@kestack/devtools-kabuki/devtools';
import type { Explored, Link } from '../index.js';
import { chipOf, idOf, planAt, plansOf, resolve } from './blueprint.js';
import { opensOf } from './folds.js';

export interface Lit {
  readonly plan: Plan;
  readonly refs: ReadonlySet<string>;
  readonly open: ReadonlySet<string>;
}

interface Lighted {
  readonly from: Plan;
  readonly to: Plan;
  readonly label: string | null;
}

export interface Picture {
  readonly focus: Plan | null;
  readonly cards: ReadonlyMap<string, Lit>;
  readonly links: ReadonlyArray<Lighted>;
  readonly missing: ReadonlyArray<string>;
}

interface Scene {
  readonly focus?: string;
  readonly show: ReadonlyArray<Explored>;
  readonly links?: ReadonlyArray<Link>;
}

const litOf = (plan: Plan, shown: Explored) => {
  const missing: Array<string> = [];
  const refs = new Set<string>();
  for (const ref of shown.lit) {
    const ids = resolve(plan, ref);
    if (ids.length === 0) missing.push(chipOf(plan.path, ref));
    for (const id of ids) refs.add(id);
  }
  const open =
    shown.open === undefined ? opensOf(plan, refs) : new Set(shown.open);
  return { lit: { plan, refs, open }, missing };
};

export const pictureOf = (root: Plan | null, scene: Scene): Picture => {
  const missing: Array<string> = [];
  const find = (path: string) => {
    const plan = root === null ? null : planAt(root, path);
    if (plan === null && !missing.includes(path)) missing.push(path);
    return plan;
  };
  const focus = scene.focus === undefined ? null : find(scene.focus);
  const cards = new Map<string, Lit>();
  for (const shown of scene.show) {
    const plan = find(shown.actor);
    if (plan === null) continue;
    const { lit, missing: lost } = litOf(plan, shown);
    cards.set(plan.path, lit);
    missing.push(...lost);
  }
  const links = (scene.links ?? []).flatMap(({ from, to, label }) => {
    const start = root === null ? null : planAt(root, from);
    const end = root === null ? null : planAt(root, to);
    if (start === null || end === null) {
      missing.push(`${from} → ${to}`);
      return [];
    }
    return [{ from: start, to: end, label: label ?? null }];
  });
  return { focus, cards, links, missing };
};

export const shownOf = (lit: Lit): Explored => ({
  actor: lit.plan.path,
  lit: [...lit.refs],
});

interface Chip {
  readonly label: string | null;
  readonly mark: '↓' | '↑' | '→' | '←';
}

export interface Connector {
  readonly from: string;
  readonly to: string;
  readonly tree: boolean;
  readonly lit: boolean;
  readonly quiet: boolean;
  readonly chips: ReadonlyArray<Chip>;
}

const pairOf = (one: string, other: string) =>
  one < other ? `${one}\u0000${other}` : `${other}\u0000${one}`;

export const connectorsOf = (
  root: Plan | null,
  picture: Picture,
  story: boolean,
): ReadonlyArray<Connector> => {
  const tree = (root === null ? [] : plansOf(root)).flatMap((plan) =>
    plan.children.map(({ name, state, plan: child }) => ({
      from: plan.path,
      to: child.path,
      tree: true,
      slot: idOf({ kind: 'child', name, level: state ?? null }),
      chips: [] as Array<Chip>,
    })),
  );
  const byPair = new Map<string, (typeof tree)[number]>(
    tree.map((one) => [pairOf(one.from, one.to), one]),
  );
  for (const { from, to, label } of picture.links) {
    const pair = pairOf(from.path, to.path);
    const known = byPair.get(pair);
    const connector = known ?? {
      from: from.path,
      to: to.path,
      tree: false,
      slot: '',
      chips: [] as Array<Chip>,
    };
    if (known === undefined) byPair.set(pair, connector);
    const forward = connector.from === from.path;
    connector.chips.push({
      label,
      mark: connector.tree ? (forward ? '↓' : '↑') : forward ? '→' : '←',
    });
  }
  return [...byPair.values()].map(({ slot, ...connector }) => {
    const lit =
      connector.chips.length > 0 ||
      (connector.tree &&
        picture.cards.has(connector.to) &&
        (picture.cards.get(connector.from)?.refs.has(slot) ?? false));
    return {
      ...connector,
      lit,
      quiet: story && !lit && !picture.cards.has(connector.to),
    };
  });
};
