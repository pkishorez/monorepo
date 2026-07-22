import type {
  BlockId,
  ExecutionItem,
  ExecutionPath,
  StoryArm,
  StoryArtifact,
  StoryBlock,
  StoryCatalog,
  StoryCatalogGroup,
  StoryGroupPath,
  StoryId,
  StoryScenario,
  StorySelectedArm,
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
}

export interface StoryEntry {
  readonly storyId: StoryId;
  readonly name: string;
  readonly description: string;
  readonly groupPath: StoryGroupPath;
  readonly artifact?: StoryArtifact;
  readonly scenarios: readonly ScenarioEntry[];
}

export interface StoryGroupEntry {
  readonly path: StoryGroupPath;
  readonly name: string;
  readonly description: string;
  readonly groups: readonly StoryGroupEntry[];
  readonly stories: readonly StoryEntry[];
  readonly descendantStoryIds: readonly StoryId[];
}

export interface StoryCatalogTree {
  readonly groups: readonly StoryGroupEntry[];
  readonly standaloneStories: readonly StoryEntry[];
  readonly stories: readonly StoryEntry[];
}

export interface ScenarioEntry {
  readonly scenarioIndex: number;
  readonly scenario: StoryScenario;
}

interface PathSpan {
  readonly entries: ReadonlySet<string>;
  readonly exits: ReadonlySet<string>;
}

const emptySpan: PathSpan = { entries: new Set(), exits: new Set() };

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
  for (const span of spans) {
    if (span.entries.size === 0) continue;
    if (entries.size === 0) entries = span.entries;
    for (const source of exits) {
      for (const target of span.entries) addEdge(edges, source, target);
    }
    exits = span.exits;
  }
  return { entries, exits };
}

function parallelSpan(spans: readonly PathSpan[]): PathSpan {
  return {
    entries: new Set(spans.flatMap((span) => [...span.entries])),
    exits: new Set(spans.flatMap((span) => [...span.exits])),
  };
}

type NodeIdFor = (
  address: string,
  item: VisitItem,
  parentBlockId: BlockId | undefined,
) => string;

function progressiveItemSpan(
  item: ExecutionItem,
  address: string,
  parentBlockId: BlockId | undefined,
  story: StoryArtifact,
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
    nodeId,
    preserveVisits,
    nodes,
    edges,
    childrenByNode,
  );
  const childSource = selectedArmNodeId ?? id;
  for (const target of childSpan.entries) addEdge(edges, childSource, target);
  return {
    entries: new Set([id]),
    exits:
      childSpan.exits.size > 0
        ? childSpan.exits
        : new Set([selectedArmNodeId ?? id]),
  };
}

function progressivePathSpan(
  path: ExecutionPath,
  prefix: string,
  parentBlockId: BlockId | undefined,
  story: StoryArtifact,
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
  story: StoryArtifact,
  scenarios: readonly StoryScenario[],
  nodeId: NodeIdFor,
  preserveVisits: boolean,
): ProgressiveStoryGraphModel {
  const nodes = new Map<string, StoryGraphNode>();
  const edges = new Map<string, StoryGraphEdge>();
  const childrenByNode = new Map<string, Set<string>>();
  for (const scenario of scenarios) {
    if (scenario.outcome === 'skipped') continue;
    progressivePathSpan(
      scenario.execution,
      '',
      undefined,
      story,
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
  story: StoryArtifact,
): ProgressiveStoryGraphModel {
  const parentContexts = blockParentContexts(story.scenarios);
  return withoutCycleEdges(
    progressiveModel(
      story,
      story.scenarios,
      (_address, item, parentBlockId) =>
        (parentContexts.get(item.blockId)?.size ?? 0) > 1
          ? `${item.blockId}@${parentBlockId ?? 'root'}`
          : item.blockId,
      false,
    ),
  );
}

/** Flattens one Scenario into execution flow while preserving every Visit. */
export function buildProgressiveScenarioGraph(
  story: StoryArtifact,
  scenario: StoryScenario,
): ProgressiveStoryGraphModel {
  const model = progressiveModel(story, [scenario], (address) => address, true);
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
    const descendants = descendantNodeIds(model, nodeId);
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
      if (!region.has(edge.source) || !visibleNodeIds.has(edge.target))
        continue;
      const id = `${nodeId}->${edge.target}::collapsed`;
      if (visibleEdges.some((visibleEdge) => visibleEdge.id === id)) continue;
      visibleEdges.push({
        id,
        source: nodeId,
        target: edge.target,
        inactive: edge.inactive,
        summary: true,
      });
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
  };
}

/** Produces stable navigation entries; Scenario order is declaration order. */
export function buildStoryEntries(
  catalog: StoryCatalog,
  stories: Readonly<Record<StoryId, StoryArtifact>>,
): StoryEntry[] {
  return catalog.stories
    .map((catalogStory) => {
      const artifact = stories[catalogStory.storyId];
      return {
        storyId: catalogStory.storyId,
        name: catalogStory.name,
        description: catalogStory.description,
        groupPath: catalogStory.groupPath,
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
        comparePaths(left.groupPath, right.groupPath) ||
        left.name.localeCompare(right.name) ||
        left.storyId.localeCompare(right.storyId),
    );
}

/** Builds the alphabetized Group hierarchy used by both catalog surfaces. */
export function buildStoryCatalogTree(
  catalog: StoryCatalog,
  artifacts: Readonly<Record<StoryId, StoryArtifact>>,
): StoryCatalogTree {
  const stories = buildStoryEntries(catalog, artifacts);
  const storyById = new Map(stories.map((story) => [story.storyId, story]));

  const buildGroup = (group: StoryCatalogGroup): StoryGroupEntry => {
    const groups = catalog.groups
      .filter(({ path }) => isDirectChild(path, group.path))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(buildGroup);
    const directStories = catalog.stories
      .filter(({ groupPath }) => samePath(groupPath, group.path))
      .map(({ storyId }) => storyById.get(storyId)!)
      .sort((left, right) => left.name.localeCompare(right.name));
    return {
      path: group.path,
      name: group.name,
      description: group.description,
      groups,
      stories: directStories,
      descendantStoryIds: [
        ...directStories.map(({ storyId }) => storyId),
        ...groups.flatMap(({ descendantStoryIds }) => descendantStoryIds),
      ],
    };
  };

  const groups = catalog.groups
    .filter(({ path }) => path.length === 1)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(buildGroup);
  const standaloneStories = catalog.stories
    .filter(({ groupPath }) => groupPath.length === 0)
    .map(({ storyId }) => storyById.get(storyId)!)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { groups, standaloneStories, stories };
}

export const storyGroupKey = pathKey;

function pathKey(path: StoryGroupPath): string {
  return JSON.stringify(path);
}

function samePath(left: StoryGroupPath, right: StoryGroupPath): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function isDirectChild(path: StoryGroupPath, parent: StoryGroupPath): boolean {
  return (
    path.length === parent.length + 1 && samePath(path.slice(0, -1), parent)
  );
}

function comparePaths(left: StoryGroupPath, right: StoryGroupPath): number {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const compared = left[index]!.localeCompare(right[index]!);
    if (compared !== 0) return compared;
  }
  return left.length - right.length;
}
