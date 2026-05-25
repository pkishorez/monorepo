import type { VizSummary } from '../types';

type FeatureGraph = NonNullable<VizSummary['featureGraphs']>[number];

export type TreeNode = {
  id: string;
  kind: 'seed' | 'file' | 'folder';
  file: string;
  layers: string[];
  files?: string[];
  children: TreeNode[];
  runtimeCount: number;
  typeOnlyCount: number;
};

export type FeatureTree = {
  roots: TreeNode[];
  seeds: string[];
};

const AUTO_COLLAPSE_DEPTH = 2;

/**
 * Builds a pure tree from the feature graph. Nodes beyond depth 2 are
 * auto-collapsed into folder nodes unless their folder ID is in
 * expandedFolders or a deep-expanded ancestor covers them.
 */
export function buildFeatureTree(
  graph: FeatureGraph,
  expandedFolders: Set<string>,
  deepExpandedFolders: Set<string>,
): FeatureTree {
  const seedSet = new Set(graph.seeds);

  const childrenOf = new Map<
    string,
    Array<{ target: string; runtime: number; typeOnly: number }>
  >();
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;

    let list = childrenOf.get(edge.from);
    if (!list) {
      list = [];
      childrenOf.set(edge.from, list);
    }

    const existing = list.find((c) => c.target === edge.to);
    if (existing) {
      if (edge.dependencyKind === 'runtime') existing.runtime++;
      else existing.typeOnly++;
    } else {
      list.push({
        target: edge.to,
        runtime: edge.dependencyKind === 'runtime' ? 1 : 0,
        typeOnly: edge.dependencyKind === 'type-only' ? 1 : 0,
      });
    }
  }

  const nodeMap = new Map<string, FeatureGraph['nodes'][number]>();
  for (const node of graph.nodes) {
    nodeMap.set(node.file, node);
  }

  function dirOf(file: string): string {
    const idx = file.lastIndexOf('/');
    return idx > 0 ? file.substring(0, idx) : file;
  }

  function buildSubtree(
    nodeId: string,
    parentPath: string,
    visited: Set<string>,
    depth: number,
    forceExpand: boolean,
  ): TreeNode {
    const treeId = parentPath ? `${parentPath}/${nodeId}` : nodeId;
    const isSeed = seedSet.has(nodeId);
    const graphNode = nodeMap.get(nodeId);

    const node: TreeNode = {
      id: treeId,
      kind: isSeed ? 'seed' : 'file',
      file: nodeId,
      layers: graphNode?.layers ?? [],
      children: [],
      runtimeCount: 0,
      typeOnlyCount: 0,
    };

    if (visited.has(nodeId)) return node;
    visited.add(nodeId);

    const kids = childrenOf.get(nodeId);
    if (!kids || kids.length === 0) return node;

    const shouldCollapse = !forceExpand && depth + 1 >= AUTO_COLLAPSE_DEPTH;

    if (shouldCollapse) {
      const grouped = new Map<
        string,
        Array<{ target: string; runtime: number; typeOnly: number }>
      >();
      for (const child of kids) {
        const dir = dirOf(child.target);
        let group = grouped.get(dir);
        if (!group) {
          group = [];
          grouped.set(dir, group);
        }
        group.push(child);
      }

      for (const [dir, children] of grouped) {
        const folderId = `${treeId}/__folder__${dir}`;
        const isExpanded = expandedFolders.has(folderId);
        const isDeepExpanded = deepExpandedFolders.has(folderId);

        if (children.length === 1) {
          const child = children[0];
          const childNode = buildSubtree(
            child.target,
            treeId,
            new Set(visited),
            depth + 1,
            forceExpand,
          );
          childNode.runtimeCount = child.runtime;
          childNode.typeOnlyCount = child.typeOnly;
          node.children.push(childNode);
        } else {
          const files = children.map((c) => c.target);
          const layers = files
            .flatMap((f) => nodeMap.get(f)?.layers ?? [])
            .filter((l, i, a) => a.indexOf(l) === i);
          let totalRuntime = 0;
          let totalTypeOnly = 0;
          for (const c of children) {
            totalRuntime += c.runtime;
            totalTypeOnly += c.typeOnly;
          }

          const folderNode: TreeNode = {
            id: folderId,
            kind: 'folder',
            file: dir,
            layers,
            files,
            children: [],
            runtimeCount: totalRuntime,
            typeOnlyCount: totalTypeOnly,
          };

          if (isExpanded || isDeepExpanded) {
            for (const child of children) {
              const childNode = buildSubtree(
                child.target,
                treeId,
                new Set(visited),
                depth + 1,
                isDeepExpanded,
              );
              childNode.runtimeCount = child.runtime;
              childNode.typeOnlyCount = child.typeOnly;
              folderNode.children.push(childNode);
            }
          }

          node.children.push(folderNode);
        }
      }
    } else {
      for (const child of kids) {
        const childNode = buildSubtree(
          child.target,
          treeId,
          new Set(visited),
          depth + 1,
          forceExpand,
        );
        childNode.runtimeCount = child.runtime;
        childNode.typeOnlyCount = child.typeOnly;
        node.children.push(childNode);
      }
    }

    return node;
  }

  const roots: TreeNode[] = graph.seeds.map((seed) =>
    buildSubtree(seed, '', new Set(), 0, false),
  );

  return { roots, seeds: graph.seeds };
}

export function collectTreeNodeFiles(node: TreeNode): string[] {
  if (node.kind === 'folder' && node.files) return node.files;
  return [node.file];
}

export function collectAncestorIds(
  tree: FeatureTree,
  targetId: string,
): Set<string> {
  const result = new Set<string>();

  function walk(node: TreeNode, ancestors: string[]): boolean {
    if (node.id === targetId) {
      for (const a of ancestors) result.add(a);
      result.add(targetId);
      return true;
    }
    for (const child of node.children) {
      if (walk(child, [...ancestors, node.id])) return true;
    }
    return false;
  }

  for (const root of tree.roots) {
    walk(root, []);
  }
  return result;
}
