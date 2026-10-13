import type {
  ArchitectureAnalysis,
  ConfigException,
  ModuleImport,
  Rule,
} from 'laymos';

import {
  cardHolding,
  contains,
  isAncestor,
  pathTo,
  topPathOf,
  type LaymoNode,
  type LaymoTree,
} from './laymo-tree';

/** A line is an observed import; a Violation is one no Rule or Exception allows. */
export type EdgeKind = 'import' | 'violation';

/** How a line stands: at rest, or lit by what is selected. */
export type EdgeEmphasis = 'plain' | 'lit';

/**
 * One line between two shown cards, carrying every observed import of its
 * kind that rolls up to that pair.
 */
export interface LaymoEdge {
  readonly id: string;
  readonly kind: EdgeKind;
  readonly from: string;
  readonly to: string;
  readonly emphasis: EdgeEmphasis;
  /** With a card in focus: whether the line leaves it (`out`) or enters it. */
  readonly direction?: 'out' | 'in' | undefined;
  readonly imports: readonly ModuleImport[];
}

/** The import edges among the children of `card` that decide their ranks. */
export function rankEdgesOf(
  card: LaymoNode,
  analysis: ArchitectureAnalysis,
): readonly (readonly [string, string])[] {
  const childOf = (path: string) =>
    card.children.find((child) => contains(topPathOf(child), path));
  const between = (from: string, to: string) => {
    const fromChild = childOf(from);
    const toChild = childOf(to);
    return fromChild === undefined ||
      toChild === undefined ||
      fromChild === toChild
      ? []
      : [[fromChild.key, toChild.key] as const];
  };
  const declared: (readonly [string, string])[] = [];
  for (const [from, targets] of Object.entries(analysis.config.rules)) {
    for (const to of targets) {
      if (from !== '*') {
        declared.push(...between(from, to));
        continue;
      }
      // A Shared Rule grants a card to its siblings: they all sit above it.
      const target = card.children.find((child) => topPathOf(child) === to);
      if (target === undefined) continue;
      for (const sibling of card.children)
        if (sibling !== target) declared.push([sibling.key, target.key]);
    }
  }
  if (declared.length > 0) return declared;
  return analysis.imports.flatMap((edge) =>
    edge.verdict.kind === 'nested'
      ? []
      : between(edge.fromModule, edge.toModule),
  );
}

/**
 * What the lines are about: nothing, one card, or one entry of the Rule list.
 * A card may be narrowed `toward` one of the cards it is lit with.
 */
export type LineFocus =
  | {
      readonly kind: 'card';
      readonly key: string;
      readonly toward?: string | undefined;
    }
  | { readonly kind: 'rule'; readonly entry: RuleEntry }
  | undefined;

/**
 * The lines of the Laymo and what they light. Lines are the imports the
 * code makes, never the Rules. With nothing in focus, every line joins two
 * siblings: an open card shows how its children depend on each other, and
 * no line crosses a card's border. A card in focus shows only the imports
 * crossing its border, one line from its own frame to each shown card
 * outside it, and lights those cards and the cards inside it the imports
 * start or end in: what it exposes and what reaches out. The rest it holds
 * talk only among themselves, and dim;
 * narrowed toward one of those, only the lines to it stay lit and the rest
 * of what was lit is `soft`. A Rule list entry shows the
 * imports it allows. `lit` is undefined at rest.
 */
export interface LaymoLines {
  readonly edges: readonly LaymoEdge[];
  readonly lit: ReadonlySet<string> | undefined;
  readonly soft: ReadonlySet<string>;
  /** The Rule list entries allowing the lit imports. */
  readonly ruleIds: ReadonlySet<string>;
}

/** The Rule list entry allowing an import, if one does. */
function entryIdOf(
  analysis: ArchitectureAnalysis,
  edge: ModuleImport,
): string | undefined {
  const { verdict } = edge;
  if (verdict.kind === 'exception') return exceptionIdOf(verdict.exception);
  if (verdict.kind !== 'rule') return undefined;
  const declared = analysis.config.rules[verdict.rule.from]?.includes(
    verdict.rule.to,
  );
  // A Shared Rule is judged as the concrete Rule from the sibling.
  return declared === true
    ? ruleIdOf(verdict.rule)
    : ruleIdOf({ from: '*', to: verdict.rule.to });
}

export function laymoLines(
  tree: LaymoTree,
  open: ReadonlySet<string>,
  analysis: ArchitectureAnalysis,
  focus: LineFocus,
): LaymoLines {
  const holder = (path: string) =>
    cardHolding(tree, path, (card) => open.has(card.key)).key;
  const edges = new Map<string, LaymoEdge>();
  const add = (
    edge: ModuleImport,
    from: string,
    to: string,
    emphasis: EdgeEmphasis,
    direction?: 'out' | 'in',
  ) => {
    if (from === to || isAncestor(tree, from, to) || isAncestor(tree, to, from))
      return false;
    const kind: EdgeKind =
      edge.verdict.kind === 'violation' ? 'violation' : 'import';
    const id = `${kind}:${from}->${to}`;
    const known = edges.get(id);
    edges.set(id, {
      id,
      kind,
      from,
      to,
      emphasis,
      direction,
      imports: [...(known?.imports ?? []), edge],
    });
    return true;
  };
  const lit = new Set<string>();
  const ruleIds = new Set<string>();
  const result = (soft: ReadonlySet<string> = new Set()) => ({
    edges: [...edges.values()],
    lit,
    soft,
    ruleIds,
  });

  if (focus === undefined) {
    // Each end climbs to the child of the card holding both ends.
    for (const edge of analysis.imports) {
      const from = pathTo(tree, holder(edge.fromModule));
      const to = pathTo(tree, holder(edge.toModule));
      let depth = 0;
      while (from[depth] !== undefined && from[depth] === to[depth]) depth += 1;
      const a = from[depth];
      const b = to[depth];
      if (a !== undefined && b !== undefined) add(edge, a.key, b.key, 'plain');
    }
    return { ...result(), lit: undefined };
  }

  if (focus.kind === 'rule') {
    const { entry } = focus;
    ruleIds.add(entry.id);
    for (const path of endsOf(analysis, entry)) lit.add(holder(path));
    for (const edge of analysis.imports) {
      if (entryIdOf(analysis, edge) !== entry.id) continue;
      const from = holder(edge.fromModule);
      const to = holder(edge.toModule);
      if (add(edge, from, to, 'lit')) {
        lit.add(from);
        lit.add(to);
      }
    }
    return result();
  }

  const card = tree.byKey.get(focus.key);
  if (card === undefined) return { ...result(), lit: undefined };
  lit.add(card.key);
  const top = topPathOf(card);
  const inside = (path: string) => contains(top, path);
  for (const edge of analysis.imports) {
    if (inside(edge.fromModule) === inside(edge.toModule)) continue;
    // The card speaks for everything inside it, from its frame; the shown
    // card inside that the import starts or ends in is lit with it.
    const out = inside(edge.fromModule);
    const within = holder(out ? edge.fromModule : edge.toModule);
    const beyond = holder(out ? edge.toModule : edge.fromModule);
    const from = out ? card.key : beyond;
    const to = out ? beyond : card.key;
    if (!add(edge, from, to, 'lit', out ? 'out' : 'in')) continue;
    lit.add(within);
    lit.add(beyond);
    const id = entryIdOf(analysis, edge);
    if (id !== undefined) ruleIds.add(id);
  }

  const toward = focus.toward;
  if (toward === undefined || !lit.has(toward) || toward === card.key)
    return result();
  // Narrowed toward one card: only its lines stay lit.
  const narrowed = new Set<string>([card.key, toward]);
  for (const [id, edge] of edges) {
    const touches = edge.from === toward || edge.to === toward;
    if (touches) {
      narrowed.add(edge.from);
      narrowed.add(edge.to);
    } else edges.set(id, { ...edge, emphasis: 'plain' });
  }
  const soft = new Set([...lit].filter((key) => !narrowed.has(key)));
  lit.clear();
  for (const key of narrowed) lit.add(key);
  return result(soft);
}

/** One line of the Rule list: a Rule or an Exception of the Config. */
export interface RuleEntry {
  readonly id: string;
  readonly kind: 'rule' | 'exception';
  readonly from: string;
  readonly to: string;
  /** An Exception's Reason. */
  readonly because?: string | undefined;
  /** No observed import uses it. */
  readonly unused: boolean;
}

export const ruleIdOf = (rule: Rule) => `rule:${rule.from}->${rule.to}`;
export const exceptionIdOf = (exception: ConfigException) =>
  `exception:${exception.from}->${exception.to}`;

/** Every Rule in Config order, then every Exception. */
export function ruleEntriesOf(
  analysis: ArchitectureAnalysis,
): readonly RuleEntry[] {
  const unused = new Set(
    analysis.findings.flatMap((finding) =>
      finding.kind === 'unused-rule'
        ? [ruleIdOf(finding.rule)]
        : finding.kind === 'unused-exception'
          ? [exceptionIdOf(finding.exception)]
          : [],
    ),
  );
  const rules = Object.entries(analysis.config.rules).flatMap(
    ([from, targets]) =>
      targets.map((to): RuleEntry => {
        const id = ruleIdOf({ from, to });
        return { id, kind: 'rule', from, to, unused: unused.has(id) };
      }),
  );
  const exceptions = analysis.config.exceptions.map((exception): RuleEntry => {
    const id = exceptionIdOf(exception);
    return {
      id,
      kind: 'exception',
      from: exception.from,
      to: exception.to,
      because: exception.because,
      unused: unused.has(id),
    };
  });
  return [...rules, ...exceptions];
}

/** The Modules and Wrappers beside `path`, under the same parent. */
function siblingsOf(
  analysis: ArchitectureAnalysis,
  path: string,
): readonly string[] {
  const parent = analysis.tree.nodes.find((node) =>
    node.children.includes(path),
  );
  return parent === undefined
    ? []
    : parent.children.filter((child) => child !== path);
}

/** The paths a Rule list entry names, `*` read as every sibling of the target. */
export function endsOf(
  analysis: ArchitectureAnalysis,
  entry: RuleEntry,
): readonly string[] {
  return entry.from === '*'
    ? [entry.to, ...siblingsOf(analysis, entry.to)]
    : [entry.from, entry.to];
}
