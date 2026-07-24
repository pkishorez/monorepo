import { Effect } from 'effect';

import type { LaymosConfig } from '../../config/types.js';
import { pathContains } from '../../config/path.js';
import type { FileGraph, FileNode } from '../extract-dependencies/index.js';

export type ResolvedFile =
  | { readonly kind: 'ignored'; readonly path: string }
  | { readonly kind: 'uncovered'; readonly path: string }
  | {
      readonly kind: 'covered';
      readonly path: string;
      readonly layer: string;
      readonly module?: string;
    };

export interface ResolvedProject {
  readonly config: LaymosConfig;
  readonly fileGraph: FileGraph;
  readonly files: Readonly<Record<string, ResolvedFile>>;
  readonly reachability: Readonly<Record<string, readonly string[]>>;
}

/** Assigns files to layers and modules; validation happens in defineConfig. */
export function resolveProject(
  config: LaymosConfig,
  fileGraph: FileGraph,
): Effect.Effect<ResolvedProject> {
  const layers = [
    ...new Set(config.graphs.flatMap((graph) => [...graph.layers])),
  ];
  const files: Record<string, ResolvedFile> = {};

  for (const path of Object.keys(fileGraph.files).sort()) {
    if ((config.ignore ?? []).some((ignored) => pathContains(ignored, path))) {
      files[path] = { kind: 'ignored', path };
      continue;
    }

    const layer = layers
      .flatMap((candidate) =>
        candidate.paths
          .filter((prefix) => pathContains(prefix, path))
          .map((prefix) => ({ candidate, prefix })),
      )
      .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.candidate;
    if (layer === undefined) {
      files[path] = { kind: 'uncovered', path };
      continue;
    }

    const module = (config.modules ?? []).find((candidate) =>
      pathContains(candidate.path, path),
    );
    files[path] = {
      kind: 'covered',
      path,
      layer: layer.name,
      ...(module !== undefined ? { module: module.path } : {}),
    };
  }

  const visibleFileGraph: FileGraph = {
    files: Object.fromEntries(
      Object.entries(fileGraph.files).map(
        ([path, node]): [string, FileNode] => [
          path,
          {
            path,
            imports:
              files[path]?.kind === 'ignored'
                ? []
                : node.imports.filter(
                    (target) => files[target]?.kind !== 'ignored',
                  ),
          },
        ],
      ),
    ),
  };

  return Effect.succeed({
    config,
    fileGraph: visibleFileGraph,
    files,
    reachability: buildReachability(config),
  }).pipe(Effect.withSpan('architecture.resolve'));
}

function buildReachability(
  config: LaymosConfig,
): Readonly<Record<string, readonly string[]>> {
  const adjacency = new Map<string, Set<string>>();
  for (const graph of config.graphs) {
    for (const layer of graph.layers) {
      if (!adjacency.has(layer.name)) adjacency.set(layer.name, new Set());
    }
    for (const edge of graph.edges) {
      adjacency.get(edge.from.name)!.add(edge.to.name);
    }
  }

  const reachability: Record<string, string[]> = {};
  for (const layer of adjacency.keys()) {
    const reached = new Set<string>();
    const pending = [...(adjacency.get(layer) ?? [])];
    while (pending.length > 0) {
      const next = pending.pop()!;
      if (reached.has(next)) continue;
      reached.add(next);
      pending.push(...(adjacency.get(next) ?? []));
    }
    reachability[layer] = [...reached].sort();
  }
  return reachability;
}
