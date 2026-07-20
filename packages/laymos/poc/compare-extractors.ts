/**
 * POC: compare dependency-cruiser and skott as raw import-graph extractors.
 *
 * Runs both with zero rules against a target TypeScript package and compares:
 * - edge sets (adjacency discrepancies)
 * - per-edge metadata (type-only labeling, dynamic imports, line numbers)
 * - performance
 *
 * skott has no per-edge metadata, so type-only edges are derived by diffing
 * two runs (dependencyTracking.typeOnly on vs off).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { relative, resolve } from 'node:path';

import { cruise } from 'dependency-cruiser';
import skott from 'skott';

const targetDir = resolve(
  process.argv[2] ?? resolve(import.meta.dirname, '../../depcruise-viz'),
);
const outDir = resolve(import.meta.dirname, '_artifacts');
mkdirSync(outDir, { recursive: true });

const inSrc = (path: string) => path.startsWith('src/');
const edgeKey = (from: string, to: string) => `${from} -> ${to}`;

interface EdgeInfo {
  from: string;
  to: string;
  meta?: Record<string, unknown>;
}

async function runDependencyCruiser() {
  const start = performance.now();
  const previousCwd = process.cwd();
  let output: unknown;
  try {
    process.chdir(targetDir);
    const result = await cruise(
      ['src'],
      {
        validate: false,
        tsPreCompilationDeps: 'specify',
        tsConfig: { fileName: resolve(targetDir, 'tsconfig.json') },
        doNotFollow: { path: 'node_modules' },
        exclude: { path: 'node_modules' },
        baseDir: targetDir,
      },
      { bustTheCache: true },
    );
    output = result.output;
  } finally {
    process.chdir(previousCwd);
  }
  const durationMs = performance.now() - start;

  const cruiseResult = output as {
    modules: Array<{
      source: string;
      dependencies: Array<{
        resolved: string;
        module: string;
        dependencyTypes: string[];
        dynamic: boolean;
        coreModule?: boolean;
      }>;
    }>;
  };

  const edges: EdgeInfo[] = [];
  for (const module of cruiseResult.modules) {
    if (!inSrc(module.source)) continue;
    for (const dep of module.dependencies) {
      if (!inSrc(dep.resolved)) continue;
      edges.push({
        from: module.source,
        to: dep.resolved,
        meta: {
          dependencyTypes: dep.dependencyTypes,
          dynamic: dep.dynamic,
        },
      });
    }
  }
  return { edges, durationMs, raw: cruiseResult };
}

async function runSkott(typeOnly: boolean) {
  const start = performance.now();
  const previousCwd = process.cwd();
  let graph: Record<
    string,
    { id: string; adjacentTo: string[]; body: Record<string, unknown> }
  >;
  try {
    // skott emits node ids relative to the process cwd, not its `cwd` option.
    process.chdir(targetDir);
    const { getStructure } = await skott({
      cwd: targetDir,
      tsConfigPath: 'tsconfig.json',
      dependencyTracking: { builtin: false, thirdParty: false, typeOnly },
      fileExtensions: ['.ts', '.tsx'],
      ignorePatterns: ['dist/**', 'test/**', 'skills/**', 'node_modules/**'],
      incremental: false,
    });
    graph = getStructure().graph;
  } finally {
    process.chdir(previousCwd);
  }
  const durationMs = performance.now() - start;

  const edges: EdgeInfo[] = [];
  for (const node of Object.values(graph)) {
    const from = normalizeSkottPath(node.id);
    if (!inSrc(from)) continue;
    for (const adjacent of node.adjacentTo) {
      const to = normalizeSkottPath(adjacent);
      if (!inSrc(to)) continue;
      edges.push({ from, to });
    }
  }
  return { edges, durationMs, raw: graph };
}

function normalizeSkottPath(path: string) {
  if (path.startsWith('/')) return relative(targetDir, path);
  return path.replace(/^\.\//, '');
}

function toEdgeMap(edges: EdgeInfo[]) {
  return new Map(edges.map((edge) => [edgeKey(edge.from, edge.to), edge]));
}

function diffKeys(a: Map<string, EdgeInfo>, b: Map<string, EdgeInfo>) {
  return [...a.keys()].filter((key) => !b.has(key)).sort();
}

const dc = await runDependencyCruiser();
const skottWithTypes = await runSkott(true);
const skottRuntimeOnly = await runSkott(false);

const dcEdges = toEdgeMap(dc.edges);
const skottEdges = toEdgeMap(skottWithTypes.edges);
const skottRuntimeEdges = toEdgeMap(skottRuntimeOnly.edges);

const typeOnlyPerSkott = diffKeys(skottEdges, skottRuntimeEdges);
const typeOnlyPerDc = [...dcEdges.values()]
  .filter(
    (edge) =>
      (edge.meta?.dependencyTypes as string[] | undefined)?.includes(
        'type-only',
      ) === true,
  )
  .map((edge) => edgeKey(edge.from, edge.to))
  .sort();

const report = {
  target: targetDir,
  performance: {
    dependencyCruiserMs: Math.round(dc.durationMs),
    skottTypeOnlyOnMs: Math.round(skottWithTypes.durationMs),
    skottTypeOnlyOffMs: Math.round(skottRuntimeOnly.durationMs),
  },
  edgeCounts: {
    dependencyCruiser: dcEdges.size,
    skott: skottEdges.size,
    skottRuntimeOnly: skottRuntimeEdges.size,
  },
  discrepancies: {
    inDcNotSkott: diffKeys(dcEdges, skottEdges),
    inSkottNotDc: diffKeys(skottEdges, dcEdges),
  },
  typeOnlyLabeling: {
    dependencyCruiser: typeOnlyPerDc,
    skottViaTwoRunDiff: typeOnlyPerSkott,
    agree: JSON.stringify(typeOnlyPerDc) === JSON.stringify(typeOnlyPerSkott),
  },
  metadataSamples: {
    dependencyCruiserEdge: dc.edges[0],
    skottNode: Object.values(skottWithTypes.raw)[0],
  },
};

writeFileSync(
  resolve(outDir, 'dependency-cruiser-graph.json'),
  JSON.stringify(dc.raw, null, 2),
);
writeFileSync(
  resolve(outDir, 'skott-graph.json'),
  JSON.stringify(skottWithTypes.raw, null, 2),
);
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
