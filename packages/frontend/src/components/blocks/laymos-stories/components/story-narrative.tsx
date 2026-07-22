import {
  Ban,
  CircleCheck,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleStop,
  GitBranch,
  GitMerge,
  OctagonX,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { StoryRun, StoryScenario } from 'laymos/report';

import { cn } from '#lib/utils';

import {
  buildProgressiveScenarioGraph,
  buildProgressiveStoryGraph,
  type ProgressiveStoryGraphModel,
  type StoryArmGraphNode,
  type StoryBlockGraphNode,
} from '../lib/model';

interface NarrativeArm {
  readonly node: StoryArmGraphNode;
  readonly targets: readonly StoryBlockGraphNode[];
}

interface NarrativeNode {
  readonly node: StoryBlockGraphNode;
  readonly arms: readonly NarrativeArm[];
  readonly next: readonly StoryBlockGraphNode[];
  readonly incomingCount: number;
}

interface NarrativeGraph {
  readonly roots: readonly StoryBlockGraphNode[];
  readonly nodeById: ReadonlyMap<string, NarrativeNode>;
}

interface OutlineBlock {
  readonly kind: 'block';
  readonly entry: NarrativeNode;
  readonly branchKind?: 'decision' | 'parallel';
  readonly branches: readonly OutlineBranch[];
}

interface OutlineReference {
  readonly kind: 'reference';
  readonly target: StoryBlockGraphNode;
  readonly relation: 'rejoin' | 'cycle';
}

type OutlineItem = OutlineBlock | OutlineReference;

interface OutlineBranch {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly active?: boolean;
  readonly items: readonly OutlineItem[];
}

function buildNarrativeGraph(
  model: ProgressiveStoryGraphModel,
): NarrativeGraph {
  const graphNodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const blocks = model.nodes.filter(
    (node): node is StoryBlockGraphNode => node.kind === 'block',
  );
  const directBlockTargets = (nodeId: string) =>
    model.edges
      .filter((edge) => edge.source === nodeId)
      .flatMap((edge) => {
        const target = graphNodeById.get(edge.target);
        return target?.kind === 'block' ? [target] : [];
      });
  const incomingCount = (nodeId: string) =>
    new Set(
      model.edges
        .filter((edge) => edge.target === nodeId)
        .map((edge) => edge.source),
    ).size;
  const nodeById = new Map<string, NarrativeNode>();
  for (const node of blocks) {
    const arms = model.nodes
      .filter(
        (candidate): candidate is StoryArmGraphNode =>
          candidate.kind === 'arm' && candidate.decisionId === node.id,
      )
      .map((arm) => ({
        node: arm,
        targets: directBlockTargets(arm.id),
      }));
    nodeById.set(node.id, {
      node,
      arms,
      next: node.block.kind === 'decision' ? [] : directBlockTargets(node.id),
      incomingCount: incomingCount(node.id),
    });
  }
  const roots = blocks.filter((node) => incomingCount(node.id) === 0);
  return {
    roots: roots.length > 0 ? roots : blocks.slice(0, 1),
    nodeById,
  };
}

function buildOutline(graph: NarrativeGraph): readonly OutlineItem[] {
  const claimed = new Set<string>();

  const targetsFor = (node: StoryBlockGraphNode) => {
    const entry = graph.nodeById.get(node.id);
    if (entry === undefined) return [];
    return entry.arms.length > 0
      ? entry.arms.flatMap((arm) => arm.targets)
      : entry.next;
  };

  const distancesFrom = (start: StoryBlockGraphNode) => {
    const distances = new Map<string, number>([[start.id, 0]]);
    const pending = [start];
    while (pending.length > 0) {
      const current = pending.shift()!;
      const distance = distances.get(current.id)!;
      for (const target of targetsFor(current)) {
        if (distances.has(target.id)) continue;
        distances.set(target.id, distance + 1);
        pending.push(target);
      }
    }
    return distances;
  };

  const commonMerge = (
    targets: readonly StoryBlockGraphNode[],
    ancestors: ReadonlySet<string>,
  ) => {
    const distances = targets.map(distancesFrom);
    const candidates = [...(distances[0]?.keys() ?? [])]
      .filter(
        (id) =>
          !ancestors.has(id) &&
          distances.every((entries) => entries.has(id)) &&
          (graph.nodeById.get(id)?.incomingCount ?? 0) > 1,
      )
      .sort((left, right) => {
        const leftDistances = distances.map((entries) => entries.get(left)!);
        const rightDistances = distances.map((entries) => entries.get(right)!);
        return (
          Math.max(...leftDistances) - Math.max(...rightDistances) ||
          leftDistances.reduce((sum, value) => sum + value, 0) -
            rightDistances.reduce((sum, value) => sum + value, 0)
        );
      });
    const candidate = candidates[0];
    return candidate === undefined
      ? undefined
      : graph.nodeById.get(candidate)?.node;
  };

  const visit = (
    node: StoryBlockGraphNode,
    ancestors: ReadonlySet<string>,
    stopAt?: string,
  ): readonly OutlineItem[] => {
    if (node.id === stopAt) return [];
    if (ancestors.has(node.id)) {
      return [{ kind: 'reference', target: node, relation: 'cycle' }];
    }
    if (claimed.has(node.id)) {
      return [{ kind: 'reference', target: node, relation: 'rejoin' }];
    }
    const entry = graph.nodeById.get(node.id);
    if (entry === undefined) return [];
    claimed.add(node.id);
    const nextAncestors = new Set(ancestors).add(node.id);

    if (entry.arms.length > 0) {
      return [
        {
          kind: 'block',
          entry,
          branchKind: 'decision',
          branches: entry.arms.map((arm) => ({
            id: arm.node.id,
            name: arm.node.arm.name,
            description: arm.node.arm.description,
            active: arm.node.active,
            items: arm.targets.flatMap((target) =>
              visit(target, nextAncestors, stopAt),
            ),
          })),
        },
      ];
    }

    if (entry.next.length > 1) {
      const merge = commonMerge(entry.next, nextAncestors);
      return [
        {
          kind: 'block',
          entry,
          branchKind: 'parallel',
          branches: entry.next.map((target) => ({
            id: `${entry.node.id}::path:${target.id}`,
            name: target.block.name,
            items: visit(target, nextAncestors, merge?.id),
          })),
        },
        ...(merge === undefined ? [] : visit(merge, nextAncestors, stopAt)),
      ];
    }

    return [
      { kind: 'block', entry, branches: [] },
      ...(entry.next[0] === undefined
        ? []
        : visit(entry.next[0], nextAncestors, stopAt)),
    ];
  };

  return graph.roots.flatMap((root) => visit(root, new Set()));
}

function initialExpansion(
  items: readonly OutlineItem[],
  scenario: boolean,
): Set<string> {
  const keys = new Set<string>();
  const collect = (entries: readonly OutlineItem[]) => {
    for (const item of entries) {
      if (item.kind === 'reference') continue;
      if (item.branches.length > 0) keys.add(`block:${item.entry.node.id}`);
      for (const branch of item.branches) {
        if (!scenario || branch.active !== false) {
          if (scenario && branch.active !== false)
            keys.add(`branch:${branch.id}`);
          collect(branch.items);
        }
      }
    }
  };
  collect(items);
  return keys;
}

export function StoryNarrative({ story }: { readonly story: StoryRun }) {
  const model = useMemo(() => buildProgressiveStoryGraph(story), [story]);
  return (
    <NarrativeDocument
      model={model}
      title={story.name}
      description={story.description}
      emptyMessage="No narrated Blocks were observed in this Story."
      scenario={false}
    />
  );
}

export function ScenarioNarrative({
  story,
  scenario,
}: {
  readonly story: StoryRun;
  readonly scenario: StoryScenario;
}) {
  const model = useMemo(
    () => buildProgressiveScenarioGraph(story, scenario),
    [scenario, story],
  );
  return (
    <NarrativeDocument
      model={model}
      title={scenario.name}
      description={scenario.description}
      emptyMessage={
        scenario.outcome === 'skipped'
          ? 'This Scenario is intentionally skipped.'
          : 'No narrated Blocks were observed in this Scenario.'
      }
      scenario
    />
  );
}

function NarrativeDocument({
  model,
  title,
  description,
  emptyMessage,
  scenario,
}: {
  readonly model: ProgressiveStoryGraphModel;
  readonly title: string;
  readonly description: string;
  readonly emptyMessage: string;
  readonly scenario: boolean;
}) {
  const graph = useMemo(() => buildNarrativeGraph(model), [model]);
  const outline = useMemo(() => buildOutline(graph), [graph]);
  const defaultExpanded = useMemo(
    () => initialExpansion(outline, scenario),
    [outline, scenario],
  );
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => setExpanded(defaultExpanded), [defaultExpanded]);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="h-full overflow-y-auto bg-background">
      <article className="mx-auto w-full max-w-4xl px-8 py-12 sm:px-12">
        <header className="border-b border-border/60 pb-7">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-foreground">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </header>

        {outline.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="mt-7">
            <OutlineSequence
              items={outline}
              expanded={expanded}
              onToggle={toggle}
              scenario={scenario}
              depth={0}
            />
          </div>
        )}
      </article>
    </div>
  );
}

function OutlineSequence({
  items,
  expanded,
  onToggle,
  scenario,
  depth,
}: {
  readonly items: readonly OutlineItem[];
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly scenario: boolean;
  readonly depth: number;
}) {
  return (
    <div className="relative space-y-0.5">
      <div className="absolute bottom-4 left-3 top-4 border-l border-border/65" />
      {items.map((item, index) =>
        item.kind === 'reference' ? (
          <ReferenceRow
            key={`${item.relation}:${item.target.id}:${index}`}
            reference={item}
          />
        ) : (
          <BlockRow
            key={item.entry.node.id}
            item={item}
            expanded={expanded}
            onToggle={onToggle}
            scenario={scenario}
            depth={depth}
          />
        ),
      )}
    </div>
  );
}

function BlockRow({
  item,
  expanded,
  onToggle,
  scenario,
  depth,
}: {
  readonly item: OutlineBlock;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly scenario: boolean;
  readonly depth: number;
}) {
  const { entry } = item;
  const key = `block:${entry.node.id}`;
  const open = expanded.has(key);
  const decision = entry.arms.length > 0;
  const terminal =
    entry.node.block.kind === 'terminal'
      ? entry.node.block.completion?.kind === 'success'
        ? {
            Icon: CircleCheck,
            icon: 'border-emerald-500 bg-emerald-500 text-white',
            cap: 'bg-emerald-500',
          }
        : entry.node.block.completion?.kind === 'error'
          ? {
              Icon: OctagonX,
              icon: 'border-rose-500 bg-rose-500 text-white',
              cap: 'bg-rose-500',
            }
          : {
              Icon: CircleStop,
              icon: 'border-slate-500 bg-slate-500 text-white',
              cap: 'bg-slate-500',
            }
      : undefined;
  const expandable =
    Boolean(entry.node.block.description) || item.branches.length > 0;
  const OutcomeIcon = entry.node.visit
    ? entry.node.visit.terminalMismatch
      ? XCircle
      : {
          succeeded: CheckCircle2,
          failed: XCircle,
          interrupted: Ban,
        }[entry.node.visit.outcome]
    : undefined;

  return (
    <div className="relative py-0.5">
      {terminal && (
        <>
          <span className="absolute bottom-0 left-2.5 top-7 z-[2] w-1 bg-background" />
          <span
            className={cn(
              'absolute left-1.5 top-7 z-[3] h-0.5 w-3 rounded-full',
              terminal.cap,
            )}
          />
        </>
      )}
      <button
        type="button"
        className={cn(
          'group relative grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md py-2 pr-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
          expandable && 'hover:bg-muted/30',
        )}
        onClick={() => expandable && onToggle(key)}
        aria-expanded={expandable ? open : undefined}
      >
        <span
          className={cn(
            'relative z-10 flex size-6 items-center justify-center rounded-full border bg-background shadow-[0_0_0_4px_var(--background)] transition-colors',
            terminal
              ? terminal.icon
              : decision
                ? 'border-primary/35 text-primary'
                : 'rounded-full border-border text-muted-foreground group-hover:border-primary/40',
          )}
        >
          {terminal ? (
            <terminal.Icon className="size-3" aria-hidden />
          ) : decision ? (
            <GitBranch className="size-3" aria-hidden />
          ) : expandable ? (
            <ChevronRight
              className={cn(
                'size-3 transition-transform',
                open && 'rotate-90 text-foreground',
              )}
              aria-hidden
            />
          ) : (
            <span className="size-1.5 rounded-full bg-muted-foreground/50" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">
              {entry.node.block.name}
            </span>
            {scenario && OutcomeIcon && (
              <OutcomeIcon
                className={cn(
                  'size-3.5',
                  entry.node.visit?.terminalMismatch && 'text-destructive',
                  entry.node.visit?.outcome === 'succeeded' &&
                    !entry.node.visit?.terminalMismatch &&
                    'text-emerald-600 dark:text-emerald-400',
                  entry.node.visit?.outcome === 'failed' &&
                    !entry.node.expectedFailure &&
                    'text-destructive',
                  entry.node.expectedFailure &&
                    'text-amber-600 dark:text-amber-400',
                  entry.node.visit?.outcome === 'interrupted' &&
                    'text-amber-600 dark:text-amber-400',
                )}
                aria-label={
                  entry.node.expectedFailure
                    ? 'expected failure'
                    : entry.node.visit?.terminalMismatch
                      ? 'terminal mismatch'
                      : entry.node.visit?.outcome
                }
              />
            )}
          </span>
          {entry.node.block.kind === 'terminal' &&
            entry.node.block.completion?.kind === 'error' &&
            entry.node.block.completion.error !== undefined && (
              <span className="mt-0.5 block text-[10px] text-rose-700 dark:text-rose-300">
                {entry.node.block.completion.error}
              </span>
            )}
          {open && entry.node.block.description && (
            <span className="mt-1 block max-w-2xl text-xs leading-5 text-muted-foreground">
              {entry.node.block.description}
            </span>
          )}
        </span>
        {decision && expandable && (
          <ChevronRight
            className={cn(
              'mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        )}
      </button>

      {open && item.branches.length > 0 && (
        <div className="ml-3 mt-1 border-l border-border/70 py-1 pl-6">
          {item.branchKind === 'parallel' ? (
            <ParallelGroup
              branches={item.branches}
              expanded={expanded}
              onToggle={onToggle}
              scenario={scenario}
              depth={depth + 1}
            />
          ) : (
            <div className="space-y-1 py-1">
              {item.branches.map((branch, index) => (
                <BranchRow
                  key={branch.id}
                  branch={branch}
                  index={index}
                  expanded={expanded}
                  onToggle={onToggle}
                  scenario={scenario}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BranchRow({
  branch,
  expanded,
  onToggle,
  scenario,
  depth,
}: {
  readonly branch: OutlineBranch;
  readonly index: number;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly scenario: boolean;
  readonly depth: number;
}) {
  const key = `branch:${branch.id}`;
  const open = expanded.has(key);
  const hasContents = branch.items.length > 0;
  const muted = scenario && branch.active === false;

  return (
    <div className={cn('relative', muted && 'opacity-45')}>
      <button
        type="button"
        className="group grid w-full grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-md py-2 pr-1 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        onClick={() => hasContents && onToggle(key)}
        aria-expanded={hasContents ? open : undefined}
      >
        <span className="mt-0.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          {hasContents ? (
            <ChevronRight
              className={cn(
                'size-2.5 transition-transform',
                open && 'rotate-90',
              )}
              aria-hidden
            />
          ) : branch.active === false ? (
            <CircleDashed className="size-2.5" aria-hidden />
          ) : (
            <span className="size-1 rounded-full bg-current" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-foreground">
            {branch.name}
          </span>
          {branch.description && (
            <span className="mt-1 block max-w-2xl text-[11px] leading-4 text-muted-foreground">
              {branch.description}
            </span>
          )}
          {!hasContents && scenario && branch.active === false && (
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              Not followed in this Scenario
            </span>
          )}
        </span>
      </button>
      {open && hasContents && (
        <div className="ml-2 border-l border-border/70 pl-5">
          <OutlineSequence
            items={branch.items}
            expanded={expanded}
            onToggle={onToggle}
            scenario={scenario}
            depth={depth}
          />
        </div>
      )}
    </div>
  );
}

function ParallelGroup({
  branches,
  expanded,
  onToggle,
  scenario,
  depth,
}: {
  readonly branches: readonly OutlineBranch[];
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly scenario: boolean;
  readonly depth: number;
}) {
  return (
    <div className="relative py-1">
      <div className="mb-1.5 text-[10px] text-muted-foreground">
        These happen together
      </div>
      <div className="space-y-1">
        {branches.map((branch) => (
          <OutlineSequence
            key={branch.id}
            items={branch.items}
            expanded={expanded}
            onToggle={onToggle}
            scenario={scenario}
            depth={depth}
          />
        ))}
      </div>
    </div>
  );
}

function ReferenceRow({ reference }: { readonly reference: OutlineReference }) {
  return (
    <div className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 py-2 text-[10px] text-muted-foreground">
      <span className="relative z-10 flex size-6 items-center justify-center rounded-full border border-border bg-background shadow-[0_0_0_3px_var(--background)]">
        {reference.relation === 'rejoin' ? (
          <GitMerge className="size-2.5" aria-hidden />
        ) : (
          <RotateCcw className="size-2.5" aria-hidden />
        )}
      </span>
      <span>
        {reference.relation === 'rejoin' ? 'Continues at' : 'Returns to'}{' '}
        <span className="font-medium text-foreground">
          {reference.target.block.name}
        </span>
      </span>
    </div>
  );
}
