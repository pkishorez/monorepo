import type {
  BlockId,
  ExecutionItem,
  ExecutionPath,
  StoryArm,
  StoryRun,
  StoryBlock,
  StoryCatalog,
  StoryCatalogModule,
  StoryPath,
  StoryScenario,
  StorySelectedArm,
  StoryTrace,
  StoryTraceItem,
  StoryTracePath,
} from 'laymos/report';

export type VisitItem = Extract<ExecutionItem, { readonly blockId: BlockId }>;

export interface StoryBlockGraphNode {
  readonly kind: 'block';
  readonly id: string;
  readonly blockId: BlockId;
  readonly block: StoryBlock;
  readonly visit?: VisitItem;
  readonly observedArms?: readonly string[];
  readonly expectedFailure?: boolean;
  readonly isFlowScope?: boolean;
  readonly startsFlows?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
}

export interface StoryArmGraphNode {
  readonly kind: 'arm';
  readonly id: string;
  readonly decisionId: string;
  readonly arm: StoryArm;
  readonly active: boolean;
}

export type StoryGraphNode = StoryBlockGraphNode | StoryArmGraphNode;

export interface StoryGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly inactive: boolean;
  readonly summary?: boolean;
  readonly executionCovered?: boolean;
}

export interface StoryGraphModel {
  readonly nodes: readonly StoryGraphNode[];
  readonly edges: readonly StoryGraphEdge[];
}

export interface ProgressiveStoryGraphModel extends StoryGraphModel {
  readonly childrenByNode: Readonly<Record<string, readonly string[]>>;
}

export interface CollapsedStoryGraph {
  readonly model: ProgressiveStoryGraphModel;
  readonly hiddenCountByNode: ReadonlyMap<string, number>;
  readonly hiddenNodeIdsByNode: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface StoryExecutionCoverageCount {
  readonly covered: number;
  readonly total: number;
}

export interface StoryExecutionCoverage {
  readonly coveredNodeIds: ReadonlySet<string>;
  readonly observedEdgeIds: ReadonlySet<string>;
  readonly targetKinds: ReadonlyMap<string, 'block' | 'arm'>;
  readonly blocks: StoryExecutionCoverageCount;
  readonly arms: StoryExecutionCoverageCount;
}

export interface StoryNodeExecutionCoverage {
  readonly status: 'covered' | 'partial' | 'uncovered';
  readonly hiddenUncoveredBlocks: number;
  readonly hiddenUncoveredArms: number;
}

/** Keeps value Decisions atomic in Graph view while preserving their children. */
export function compactValueDecisions(
  model: ProgressiveStoryGraphModel,
): ProgressiveStoryGraphModel {
  const valueDecisions = new Set(
    model.nodes
      .filter(
        (node): node is StoryBlockGraphNode =>
          node.kind === 'block' &&
          node.block.kind === 'decision' &&
          node.block.role === 'value',
      )
      .map((node) => node.id),
  );
  if (valueDecisions.size === 0) return model;
  const hiddenArms = new Map(
    model.nodes
      .filter(
        (node): node is StoryArmGraphNode =>
          node.kind === 'arm' && valueDecisions.has(node.decisionId),
      )
      .map((node) => [node.id, node]),
  );
  const edges = new Map<string, StoryGraphEdge>();
  for (const edge of model.edges) {
    if (hiddenArms.has(edge.target)) continue;
    const arm = hiddenArms.get(edge.source);
    const source = arm?.decisionId ?? edge.source;
    const id = `${source}->${edge.target}`;
    const previous = edges.get(id);
    const inactive = (arm !== undefined && !arm.active) || edge.inactive;
    edges.set(id, {
      ...edge,
      id,
      source,
      inactive:
        previous === undefined ? inactive : previous.inactive && inactive,
      ...(edge.executionCovered !== undefined ||
      previous?.executionCovered !== undefined
        ? {
            executionCovered:
              edge.executionCovered === true ||
              previous?.executionCovered === true,
          }
        : {}),
    });
  }
  return {
    nodes: model.nodes.filter((node) => !hiddenArms.has(node.id)),
    edges: [...edges.values()],
    childrenByNode: model.childrenByNode,
  };
}

export interface StoryEntry {
  readonly storyPath: StoryPath;
  readonly storyKey: string;
  readonly modulePath: string;
  readonly name: string;
  readonly description: string;
  readonly documentation?: string;
  readonly artifact?: StoryRun;
  readonly scenarios: readonly ScenarioEntry[];
}

export interface StoryModuleEntry {
  readonly modulePath: string;
  readonly description: string;
  readonly stories: readonly StoryEntry[];
}

export interface StoryCatalogTree {
  readonly modules: readonly StoryModuleEntry[];
  readonly stories: readonly StoryEntry[];
}

export interface ScenarioEntry {
  readonly scenarioIndex: number;
  readonly scenario: StoryScenario;
}

interface PathSpan {
  readonly entries: ReadonlySet<string>;
  readonly exits: ReadonlySet<string>;
  readonly terminalExits: ReadonlySet<string>;
}

const emptySpan: PathSpan = {
  entries: new Set(),
  exits: new Set(),
  terminalExits: new Set(),
};

/** Derives a Visit's identity from its structural position in the path. */
export const visitAddress = (prefix: string, index: number): string =>
  prefix === '' ? String(index) : `${prefix}.${index}`;

/** Canonical key matching declared Arms against a Visit's selected Arm. */
export const armKey = (arm: StoryArm | StorySelectedArm): string =>
  arm.kind === 'otherwise'
    ? 'otherwise'
    : `literal:${typeof arm.value}:${JSON.stringify(arm.value)}`;

interface AddressedVisit {
  readonly address: string;
  readonly item: VisitItem;
}

function directVisits(path: ExecutionPath, prefix: string): AddressedVisit[] {
  const result: AddressedVisit[] = [];
  path.forEach((item, index) => {
    const address = visitAddress(prefix, index);
    if ('parallel' in item) {
      item.parallel.forEach((branch, branchIndex) => {
        result.push(
          ...directVisits(branch, visitAddress(address, branchIndex)),
        );
      });
    } else {
      result.push({ address, item });
    }
  });
  return result;
}

function addEdge(
  edges: Map<string, StoryGraphEdge>,
  source: string,
  target: string,
  active = true,
) {
  const id = `${source}->${target}`;
  const previous = edges.get(id);
  edges.set(id, {
    id,
    source,
    target,
    inactive: previous?.inactive === false ? false : !active,
  });
}

const armNodeId = (decisionId: string, arm: StoryArm): string =>
  `${decisionId}::arm:${armKey(arm)}`;

function combineSequential(
  spans: readonly PathSpan[],
  edges: Map<string, StoryGraphEdge>,
): PathSpan {
  let entries: ReadonlySet<string> = new Set();
  let exits: ReadonlySet<string> = new Set();
  const terminalExits = new Set<string>();
  for (const span of spans) {
    if (span.entries.size === 0) continue;
    for (const terminalExit of span.terminalExits) {
      terminalExits.add(terminalExit);
    }
    if (entries.size === 0) entries = span.entries;
    for (const source of exits) {
      for (const target of span.entries) addEdge(edges, source, target);
    }
    exits = span.exits;
  }
  return { entries, exits, terminalExits };
}

function parallelSpan(spans: readonly PathSpan[]): PathSpan {
  return {
    entries: new Set(spans.flatMap((span) => [...span.entries])),
    exits: new Set(spans.flatMap((span) => [...span.exits])),
    terminalExits: new Set(spans.flatMap((span) => [...span.terminalExits])),
  };
}

type NodeIdFor = (
  address: string,
  item: VisitItem,
  parentBlockId: BlockId | undefined,
) => string;

interface ProgressivePathInput {
  readonly scenario: StoryScenario;
  readonly path: ExecutionPath;
  readonly prefix: string;
  readonly parentBlockId?: BlockId;
}

function progressiveItemSpan(
  item: ExecutionItem,
  address: string,
  parentBlockId: BlockId | undefined,
  story: StoryRun,
  scenario: StoryScenario,
  nodeId: NodeIdFor,
  preserveVisits: boolean,
  nodes: Map<string, StoryGraphNode>,
  edges: Map<string, StoryGraphEdge>,
  childrenByNode: Map<string, Set<string>>,
): PathSpan {
  if ('parallel' in item) {
    return parallelSpan(
      item.parallel.map((branch, branchIndex) =>
        progressivePathSpan(
          branch,
          visitAddress(address, branchIndex),
          parentBlockId,
          story,
          scenario,
          nodeId,
          preserveVisits,
          nodes,
          edges,
          childrenByNode,
        ),
      ),
    );
  }

  const block = story.blocks[item.blockId];
  if (!block) return emptySpan;
  const id = nodeId(address, item, parentBlockId);
  const previous = nodes.get(id);
  const observedArms = new Set(
    previous?.kind === 'block' ? previous.observedArms : [],
  );
  if (item.selectedArm) observedArms.add(armKey(item.selectedArm));
  nodes.set(id, {
    kind: 'block',
    id,
    blockId: item.blockId,
    block,
    ...(preserveVisits ? { visit: item } : {}),
    observedArms: [...observedArms],
    ...(previous?.kind === 'block' && previous.startsFlows
      ? { startsFlows: previous.startsFlows }
      : {}),
    ...(previous?.kind === 'block' && previous.isFlowScope
      ? { isFlowScope: true }
      : {}),
  });

  const selectedArmKey = item.selectedArm && armKey(item.selectedArm);
  let selectedArmNodeId: string | undefined;
  if (block.kind === 'decision') {
    for (const arm of block.arms) {
      const armId = armNodeId(id, arm);
      const active = armKey(arm) === selectedArmKey;
      const previousArm = nodes.get(armId);
      nodes.set(armId, {
        kind: 'arm',
        id: armId,
        decisionId: id,
        arm,
        active: active || (previousArm?.kind === 'arm' && previousArm.active),
      });
      addEdge(edges, id, armId, active);
      if (active) selectedArmNodeId = armId;
    }
  }

  const childIds = directVisits(item.children, address).map((child) =>
    nodeId(child.address, child.item, item.blockId),
  );
  const children = childrenByNode.get(id) ?? new Set<string>();
  for (const childId of childIds) children.add(childId);
  childrenByNode.set(id, children);

  const childSpan = progressivePathSpan(
    item.children,
    address,
    item.blockId,
    story,
    scenario,
    nodeId,
    preserveVisits,
    nodes,
    edges,
    childrenByNode,
  );
  if (block.kind === 'flow') {
    if (childSpan.entries.size > 0) {
      const flowNode = nodes.get(id);
      if (flowNode?.kind === 'block') {
        nodes.set(id, { ...flowNode, isFlowScope: true });
      }
    }
    for (const target of childSpan.entries) {
      const startNode = nodes.get(target);
      if (startNode?.kind !== 'block') continue;
      const startsFlows = new Map(
        (startNode.startsFlows ?? []).map((flow) => [flow.id, flow]),
      );
      startsFlows.set(id, { id, name: block.name });
      nodes.set(target, {
        ...startNode,
        startsFlows: [...startsFlows.values()],
      });
    }
  } else {
    const childSource = selectedArmNodeId ?? id;
    for (const target of childSpan.entries) {
      addEdge(edges, childSource, target);
    }
  }
  if (block.kind === 'terminal') {
    return {
      entries: new Set([id]),
      exits: new Set(),
      terminalExits: new Set([id]),
    };
  }
  if (block.kind === 'flow' && childSpan.entries.size > 0) {
    const resumableTerminalExits = new Set(
      [...childSpan.terminalExits].filter((terminalId) => {
        const terminal = nodes.get(terminalId);
        return (
          terminal?.kind === 'block' &&
          terminal.block.kind === 'terminal' &&
          terminal.block.completion?.kind === 'success'
        );
      }),
    );
    const failedTerminalExits = new Set(
      [...childSpan.terminalExits].filter(
        (terminalId) => !resumableTerminalExits.has(terminalId),
      ),
    );
    return {
      entries: childSpan.entries,
      exits: new Set([...childSpan.exits, ...resumableTerminalExits]),
      terminalExits: failedTerminalExits,
    };
  }
  return {
    entries: new Set([id]),
    exits:
      childSpan.entries.size > 0
        ? childSpan.exits
        : new Set([selectedArmNodeId ?? id]),
    terminalExits: childSpan.terminalExits,
  };
}

function progressivePathSpan(
  path: ExecutionPath,
  prefix: string,
  parentBlockId: BlockId | undefined,
  story: StoryRun,
  scenario: StoryScenario,
  nodeId: NodeIdFor,
  preserveVisits: boolean,
  nodes: Map<string, StoryGraphNode>,
  edges: Map<string, StoryGraphEdge>,
  childrenByNode: Map<string, Set<string>>,
): PathSpan {
  return combineSequential(
    path.map((item, index) =>
      progressiveItemSpan(
        item,
        visitAddress(prefix, index),
        parentBlockId,
        story,
        scenario,
        nodeId,
        preserveVisits,
        nodes,
        edges,
        childrenByNode,
      ),
    ),
    edges,
  );
}

function progressiveModel(
  story: StoryRun,
  inputs: readonly ProgressivePathInput[],
  nodeId: NodeIdFor,
  preserveVisits: boolean,
): ProgressiveStoryGraphModel {
  const nodes = new Map<string, StoryGraphNode>();
  const edges = new Map<string, StoryGraphEdge>();
  const childrenByNode = new Map<string, Set<string>>();
  for (const input of inputs) {
    const { scenario } = input;
    if (scenario.outcome === 'skipped') continue;
    progressivePathSpan(
      input.path,
      input.prefix,
      input.parentBlockId,
      story,
      scenario,
      nodeId,
      preserveVisits,
      nodes,
      edges,
      childrenByNode,
    );
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    childrenByNode: Object.fromEntries(
      [...childrenByNode].map(([id, children]) => [id, [...children]]),
    ),
  };
}

const rootInputs = (
  scenarios: readonly StoryScenario[],
): ProgressivePathInput[] =>
  scenarios.map((scenario) => ({
    scenario,
    path: scenario.execution,
    prefix: '',
  }));

function withoutCycleEdges(
  model: ProgressiveStoryGraphModel,
): ProgressiveStoryGraphModel {
  const outgoing = new Map<string, Set<string>>();
  const edges: StoryGraphEdge[] = [];

  const reaches = (start: string, target: string): boolean => {
    const pending = [start];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(outgoing.get(current) ?? []));
    }
    return false;
  };

  for (const edge of model.edges) {
    if (edge.source === edge.target || reaches(edge.target, edge.source))
      continue;
    edges.push(edge);
    const targets = outgoing.get(edge.source) ?? new Set<string>();
    targets.add(edge.target);
    outgoing.set(edge.source, targets);
  }

  return { ...model, edges };
}

function blockParentContexts(
  scenarios: readonly StoryScenario[],
): ReadonlyMap<BlockId, ReadonlySet<string>> {
  const contexts = new Map<BlockId, Set<string>>();
  const visitPath = (path: ExecutionPath, parentBlockId?: BlockId): void => {
    for (const item of path) {
      if ('parallel' in item) {
        for (const branch of item.parallel) visitPath(branch, parentBlockId);
        continue;
      }
      const parents = contexts.get(item.blockId) ?? new Set<string>();
      parents.add(parentBlockId ?? 'root');
      contexts.set(item.blockId, parents);
      visitPath(item.children, item.blockId);
    }
  };
  for (const scenario of scenarios) {
    if (scenario.outcome !== 'skipped') visitPath(scenario.execution);
  }
  return contexts;
}

/** Flattens Story containment while separating shared Blocks by direct caller. */
export function buildProgressiveStoryGraph(
  story: StoryRun,
): ProgressiveStoryGraphModel {
  const parentContexts = blockParentContexts(story.scenarios);
  return withoutCycleEdges(
    progressiveModel(
      story,
      rootInputs(story.scenarios),
      (_address, item, parentBlockId) =>
        (parentContexts.get(item.blockId)?.size ?? 0) > 1
          ? `${item.blockId}@${parentBlockId ?? 'root'}`
          : item.blockId,
      false,
    ),
  );
}

/** Compares one canonical Story graph with the combined evidence from one run. */
export function buildStoryExecutionCoverage(
  canonicalStory: StoryRun,
  run: StoryRun,
): StoryExecutionCoverage {
  const parentContexts = blockParentContexts(canonicalStory.scenarios);
  const nodeId: NodeIdFor = (_address, item, parentBlockId) =>
    (parentContexts.get(item.blockId)?.size ?? 0) > 1
      ? `${item.blockId}@${parentBlockId ?? 'root'}`
      : item.blockId;
  const canonical = buildProgressiveStoryGraph(canonicalStory);
  const observed = withoutCycleEdges(
    progressiveModel(run, rootInputs(run.scenarios), nodeId, false),
  );
  const targetKinds = new Map<string, 'block' | 'arm'>();
  for (const node of canonical.nodes) {
    if (node.kind === 'arm') targetKinds.set(node.id, 'arm');
    else if (!node.blockId.startsWith('omission:'))
      targetKinds.set(node.id, 'block');
  }
  const coveredNodeIds = new Set(
    observed.nodes.flatMap((node) => {
      if (!targetKinds.has(node.id)) return [];
      if (node.kind === 'arm' && !node.active) return [];
      return [node.id];
    }),
  );
  const canonicalEdgeIds = new Set(canonical.edges.map(({ id }) => id));
  const observedEdgeIds = new Set(
    observed.edges.flatMap((edge) =>
      !edge.inactive && canonicalEdgeIds.has(edge.id) ? [edge.id] : [],
    ),
  );
  const count = (kind: 'block' | 'arm'): StoryExecutionCoverageCount => {
    const targets = [...targetKinds]
      .filter(([, targetKind]) => targetKind === kind)
      .map(([id]) => id);
    return {
      covered: targets.filter((id) => coveredNodeIds.has(id)).length,
      total: targets.length,
    };
  };
  return {
    coveredNodeIds,
    observedEdgeIds,
    targetKinds,
    blocks: count('block'),
    arms: count('arm'),
  };
}

/** Rolls hidden coverage gaps into the visible node that owns them. */
export function storyNodeExecutionCoverage(
  coverage: StoryExecutionCoverage,
  nodeId: string,
  hiddenNodeIds: ReadonlySet<string> = new Set(),
): StoryNodeExecutionCoverage | undefined {
  if (!coverage.targetKinds.has(nodeId)) return undefined;
  let hiddenUncoveredBlocks = 0;
  let hiddenUncoveredArms = 0;
  for (const hiddenNodeId of hiddenNodeIds) {
    if (coverage.coveredNodeIds.has(hiddenNodeId)) continue;
    const kind = coverage.targetKinds.get(hiddenNodeId);
    if (kind === 'block') hiddenUncoveredBlocks += 1;
    if (kind === 'arm') hiddenUncoveredArms += 1;
  }
  const covered = coverage.coveredNodeIds.has(nodeId);
  return {
    status: !covered
      ? 'uncovered'
      : hiddenUncoveredBlocks + hiddenUncoveredArms > 0
        ? 'partial'
        : 'covered',
    hiddenUncoveredBlocks,
    hiddenUncoveredArms,
  };
}

/** Adds edge evidence without mixing presentation state into coverage analysis. */
export function applyStoryExecutionCoverage(
  model: ProgressiveStoryGraphModel,
  coverage: StoryExecutionCoverage,
): ProgressiveStoryGraphModel {
  return {
    ...model,
    edges: model.edges.map((edge) => ({
      ...edge,
      executionCovered: coverage.observedEdgeIds.has(edge.id),
    })),
  };
}

/** Flattens one Scenario into execution flow while preserving every Visit. */
export function buildProgressiveScenarioGraph(
  story: StoryRun,
  scenario: StoryScenario,
): ProgressiveStoryGraphModel {
  const model = progressiveModel(
    story,
    rootInputs([scenario]),
    (address) => address,
    true,
  );
  return {
    ...model,
    nodes: model.nodes.map((node) =>
      node.kind === 'block' &&
      node.visit?.outcome === 'failed' &&
      scenario.outcome === 'succeeded'
        ? { ...node, expectedFailure: true }
        : node,
    ),
  };
}

/** Removes Flow calls while preserving the executable control-flow edges. */
export function withoutFlowNodes(
  model: ProgressiveStoryGraphModel,
): ProgressiveStoryGraphModel {
  const flowNodeIds = new Set(
    model.nodes.flatMap((node) =>
      node.kind === 'block' && node.block.kind === 'flow' ? [node.id] : [],
    ),
  );
  const outgoing = new Map<string, StoryGraphEdge[]>();
  for (const edge of model.edges) {
    const edges = outgoing.get(edge.source) ?? [];
    edges.push(edge);
    outgoing.set(edge.source, edges);
  }
  const targetsAfterFlows = (
    nodeId: string,
    seen = new Set<string>(),
  ): {
    readonly nodeId: string;
    readonly inactive: boolean;
    readonly summary: boolean;
    readonly executionCovered: boolean | undefined;
  }[] => {
    if (!flowNodeIds.has(nodeId)) {
      return [
        {
          nodeId,
          inactive: false,
          summary: false,
          executionCovered: true,
        },
      ];
    }
    if (seen.has(nodeId)) return [];
    const nextSeen = new Set(seen).add(nodeId);
    return (outgoing.get(nodeId) ?? []).flatMap((edge) =>
      targetsAfterFlows(edge.target, nextSeen).map((target) => ({
        nodeId: target.nodeId,
        inactive: edge.inactive || target.inactive,
        summary: edge.summary === true || target.summary,
        executionCovered:
          edge.executionCovered === undefined ||
          target.executionCovered === undefined
            ? undefined
            : edge.executionCovered && target.executionCovered,
      })),
    );
  };
  const edges = new Map<string, StoryGraphEdge>();
  for (const edge of model.edges) {
    if (flowNodeIds.has(edge.source)) continue;
    for (const target of targetsAfterFlows(edge.target)) {
      if (edge.source === target.nodeId) continue;
      const id = `${edge.source}->${target.nodeId}`;
      const previous = edges.get(id);
      edges.set(id, {
        id,
        source: edge.source,
        target: target.nodeId,
        inactive:
          previous?.inactive === false
            ? false
            : edge.inactive || target.inactive,
        ...(edge.summary === true ||
        target.summary ||
        previous?.summary === true
          ? { summary: true }
          : {}),
        ...(edge.executionCovered !== undefined ||
        target.executionCovered !== undefined ||
        previous?.executionCovered !== undefined
          ? {
              executionCovered:
                previous?.executionCovered === true ||
                (edge.executionCovered === true &&
                  target.executionCovered === true),
            }
          : {}),
      });
    }
  }
  return {
    nodes: model.nodes.flatMap((node): StoryGraphNode[] => {
      if (flowNodeIds.has(node.id)) return [];
      if (node.kind !== 'block' || !node.startsFlows) return [node];
      const { startsFlows: _startsFlows, ...controlFlowNode } = node;
      return [controlFlowNode];
    }),
    edges: [...edges.values()],
    childrenByNode: {},
  };
}

/** Adapts a structural trace to the existing graph renderer without Scenario evidence. */
export function storyRunFromTrace(
  trace: StoryTrace,
  name: string,
  description: string,
  documentation?: string,
): StoryRun {
  const blocks = { ...trace.blocks };
  const omissionId = (item: Extract<StoryTraceItem, { kind: 'omission' }>) =>
    `omission:${item.location.file}:${item.location.line}:${item.location.column}`;
  const visit = (
    blockId: string,
    children: ExecutionPath = [],
    selectedArm?: StorySelectedArm,
  ): ExecutionItem => ({
    blockId,
    outcome: 'succeeded',
    startOffsetMillis: 0,
    durationMillis: 0,
    ...(selectedArm === undefined ? {} : { selectedArm }),
    children,
  });
  const combineAlternatives = <A, B, C>(
    left: readonly A[],
    right: readonly B[],
    combine: (left: A, right: B) => C,
  ): C[] => {
    if (left.length === 0 || right.length === 0) return [];
    const count = Math.max(left.length, right.length);
    return Array.from({ length: count }, (_, index) =>
      combine(left[index % left.length]!, right[index % right.length]!),
    );
  };
  const append = (
    prefixes: readonly ExecutionPath[],
    suffixes: readonly ExecutionPath[],
  ): ExecutionPath[] =>
    combineAlternatives(prefixes, suffixes, (prefix, suffix) => [
      ...prefix,
      ...suffix,
    ]);
  const expandPath = (path: readonly StoryTraceItem[]): ExecutionPath[] => {
    let paths: ExecutionPath[] = [[]];
    for (const item of path) paths = append(paths, expandItem(item));
    return paths;
  };
  const expandItem = (item: StoryTraceItem): ExecutionPath[] => {
    if (
      item.kind === 'step' ||
      item.kind === 'terminal' ||
      item.kind === 'flow-reference'
    ) {
      return [[visit(item.blockId)]];
    }
    if (item.kind === 'flow') {
      return expandPath(item.children).map((children) => [
        visit(item.blockId, children),
      ]);
    }
    if (item.kind === 'omission') {
      const blockId = omissionId(item);
      blocks[blockId] = {
        kind: 'step',
        name: 'Omitted operation',
        description: item.reason,
        visibility: 'detail',
        location: item.location,
      };
      return [[visit(blockId)]];
    }
    if (item.kind === 'decision') {
      const arms = item.arms.flatMap(({ arm, children }) =>
        expandPath(children).map((armChildren) => ({ arm, armChildren })),
      );
      return arms.map(({ arm, armChildren }) => [
        visit(
          item.blockId,
          armChildren,
          arm.kind === 'otherwise'
            ? { kind: 'otherwise' }
            : { kind: 'literal', value: arm.value },
        ),
      ]);
    }
    if (item.kind === 'for-each') return expandPath(item.body);
    const branchChoices = item.branches.map(expandPath);
    let combinations: ExecutionPath[][] = [[]];
    for (const choices of branchChoices) {
      combinations = combineAlternatives(
        combinations,
        choices,
        (combination, choice) => [...combination, choice],
      );
    }
    const concurrent =
      item.options.concurrency === 'unbounded' ||
      item.options.concurrency === 'inherit' ||
      (typeof item.options.concurrency === 'number' &&
        item.options.concurrency > 1);
    return combinations.map((branches): ExecutionPath => {
      if (!concurrent) return branches.flat();
      if (branches.length === 1) return branches[0] ?? [];
      return [{ parallel: branches }];
    });
  };
  const executions = expandPath(trace.execution);
  return {
    generatedAt: trace.generatedAt,
    name,
    description,
    ...(documentation === undefined ? {} : { documentation }),
    blocks,
    scenarios: executions.map((execution, index) => ({
      name: `Trace path ${index + 1}`,
      description: 'One structural route through the Story Trace.',
      location: { file: '<trace>', line: 0, column: 0 },
      outcome: 'succeeded',
      execution,
      failures: [],
    })),
  };
}

/** Expands shared Flow references for a complete graph while preserving recursive references. */
export function inlineTraceDefinitions(trace: StoryTrace): StoryTrace {
  const inlinePath = (
    path: StoryTracePath,
    activeDefinitions: ReadonlySet<BlockId>,
  ): StoryTracePath =>
    path.map((item): StoryTraceItem => {
      if (item.kind === 'flow-reference') {
        const definition = trace.definitions[item.blockId];
        if (!definition || activeDefinitions.has(item.blockId)) return item;
        const active = new Set(activeDefinitions);
        active.add(item.blockId);
        return {
          kind: 'flow',
          blockId: item.blockId,
          children: inlinePath(definition, active),
        };
      }
      if (item.kind === 'flow') {
        return {
          ...item,
          children: inlinePath(item.children, activeDefinitions),
        };
      }
      if (item.kind === 'decision') {
        return {
          ...item,
          ...(item.selector
            ? { selector: inlinePath(item.selector, activeDefinitions) }
            : {}),
          arms: item.arms.map((arm) => ({
            ...arm,
            children: inlinePath(arm.children, activeDefinitions),
          })),
        };
      }
      if (item.kind === 'all') {
        return {
          ...item,
          branches: item.branches.map((branch) =>
            inlinePath(branch, activeDefinitions),
          ),
        };
      }
      if (item.kind === 'for-each') {
        return {
          ...item,
          body: inlinePath(item.body, activeDefinitions),
        };
      }
      return item;
    });

  return { ...trace, execution: inlinePath(trace.execution, new Set()) };
}

function descendantNodeIds(
  model: ProgressiveStoryGraphModel,
  nodeId: string,
): Set<string> {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of model.edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
    const sources = incoming.get(edge.target) ?? [];
    sources.push(edge.source);
    incoming.set(edge.target, sources);
  }
  const visited = new Set([nodeId]);
  const reachable = new Set<string>();
  const pending = [...(outgoing.get(nodeId) ?? [])];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    reachable.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of reachable) {
      if (descendants.has(candidate)) continue;
      const exclusivelyUnderneath = (incoming.get(candidate) ?? []).every(
        (source) => source === nodeId || descendants.has(source),
      );
      if (!exclusivelyUnderneath) continue;
      descendants.add(candidate);
      changed = true;
    }
  }
  return descendants;
}

function containedNodeIds(
  model: ProgressiveStoryGraphModel,
  nodeId: string,
): Set<string> {
  const descendants = new Set<string>();
  const pending = [...(model.childrenByNode[nodeId] ?? [])];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (descendants.has(current)) continue;
    descendants.add(current);
    pending.push(...(model.childrenByNode[current] ?? []));
    for (const node of model.nodes) {
      if (node.kind === 'arm' && node.decisionId === current) {
        descendants.add(node.id);
      }
    }
  }
  return descendants;
}

/** Hides downstream nodes while retaining collapsed roots and their counts. */
export function collapseStoryGraph(
  model: ProgressiveStoryGraphModel,
  collapsedNodeIds: ReadonlySet<string>,
): CollapsedStoryGraph {
  const hiddenCountByNode = new Map<string, number>();
  const hiddenNodeIds = new Set<string>();
  const collapsedRegions = new Map<string, ReadonlySet<string>>();
  for (const nodeId of collapsedNodeIds) {
    if (hiddenNodeIds.has(nodeId)) continue;
    const node = model.nodes.find((candidate) => candidate.id === nodeId);
    const inlineFlow =
      node?.kind === 'block' &&
      node.block.kind === 'flow' &&
      (model.childrenByNode[nodeId]?.length ?? 0) > 0;
    const descendants = inlineFlow
      ? containedNodeIds(model, nodeId)
      : descendantNodeIds(model, nodeId);
    if (descendants.size === 0) continue;
    hiddenCountByNode.set(nodeId, descendants.size);
    collapsedRegions.set(nodeId, descendants);
    for (const descendant of descendants) hiddenNodeIds.add(descendant);
  }
  const visibleNodeIds = new Set(
    model.nodes
      .filter((node) => !hiddenNodeIds.has(node.id))
      .map((node) => node.id),
  );
  const visibleEdges = model.edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
  );
  for (const [nodeId, region] of collapsedRegions) {
    if (!visibleNodeIds.has(nodeId)) continue;
    for (const edge of model.edges) {
      if (visibleNodeIds.has(edge.source) && region.has(edge.target)) {
        const id = `${edge.source}->${nodeId}::collapsed`;
        if (!visibleEdges.some((visibleEdge) => visibleEdge.id === id)) {
          visibleEdges.push({
            id,
            source: edge.source,
            target: nodeId,
            inactive: edge.inactive,
            summary: true,
            ...(edge.executionCovered === undefined
              ? {}
              : { executionCovered: edge.executionCovered }),
          });
        } else if (edge.executionCovered === true) {
          const visibleEdge = visibleEdges.find(
            (candidate) => candidate.id === id,
          );
          if (visibleEdge)
            visibleEdges[visibleEdges.indexOf(visibleEdge)] = {
              ...visibleEdge,
              executionCovered: true,
            };
        }
      }
      if (region.has(edge.source) && visibleNodeIds.has(edge.target)) {
        const id = `${nodeId}->${edge.target}::collapsed`;
        if (!visibleEdges.some((visibleEdge) => visibleEdge.id === id)) {
          visibleEdges.push({
            id,
            source: nodeId,
            target: edge.target,
            inactive: edge.inactive,
            summary: true,
            ...(edge.executionCovered === undefined
              ? {}
              : { executionCovered: edge.executionCovered }),
          });
        } else if (edge.executionCovered === true) {
          const visibleEdge = visibleEdges.find(
            (candidate) => candidate.id === id,
          );
          if (visibleEdge)
            visibleEdges[visibleEdges.indexOf(visibleEdge)] = {
              ...visibleEdge,
              executionCovered: true,
            };
        }
      }
    }
  }
  return {
    model: {
      nodes: model.nodes.filter((node) => visibleNodeIds.has(node.id)),
      edges: visibleEdges,
      childrenByNode: Object.fromEntries(
        Object.entries(model.childrenByNode)
          .filter(([nodeId]) => visibleNodeIds.has(nodeId))
          .map(([nodeId, children]) => [
            nodeId,
            children.filter((childId) => visibleNodeIds.has(childId)),
          ]),
      ),
    },
    hiddenCountByNode,
    hiddenNodeIdsByNode: collapsedRegions,
  };
}

/** Produces stable navigation entries; Scenario order is declaration order. */
export function buildStoryEntries(
  catalog: StoryCatalog,
  stories: Readonly<Record<StoryPath, StoryRun>>,
): StoryEntry[] {
  return catalog.modules
    .flatMap(({ stories: moduleStories }) => moduleStories)
    .map((catalogStory) => {
      const artifact = stories[catalogStory.storyPath];
      return {
        storyPath: catalogStory.storyPath,
        storyKey: catalogStory.storyKey,
        modulePath: catalogStory.modulePath,
        name: catalogStory.name,
        description: catalogStory.description,
        ...(catalogStory.documentation === undefined
          ? {}
          : { documentation: catalogStory.documentation }),
        artifact,
        scenarios:
          artifact?.scenarios.map((scenario, scenarioIndex) => ({
            scenarioIndex,
            scenario,
          })) ?? [],
      };
    })
    .sort(
      (left, right) =>
        left.modulePath.localeCompare(right.modulePath) ||
        left.name.localeCompare(right.name) ||
        left.storyPath.localeCompare(right.storyPath),
    );
}

/** Builds the alphabetized Module catalog used by both catalog surfaces. */
export function buildStoryCatalogTree(
  catalog: StoryCatalog,
  artifacts: Readonly<Record<StoryPath, StoryRun>>,
): StoryCatalogTree {
  const stories = buildStoryEntries(catalog, artifacts);
  const storyByPath = new Map(stories.map((story) => [story.storyPath, story]));
  const modules = [...catalog.modules]
    .sort((left, right) => left.modulePath.localeCompare(right.modulePath))
    .map(
      (module: StoryCatalogModule): StoryModuleEntry => ({
        modulePath: module.modulePath,
        description: module.description,
        stories: module.stories
          .map(({ storyPath }) => storyByPath.get(storyPath)!)
          .sort(
            (left, right) =>
              left.name.localeCompare(right.name) ||
              left.storyPath.localeCompare(right.storyPath),
          ),
      }),
    );
  return { modules, stories };
}
