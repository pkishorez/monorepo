import { realpath } from 'node:fs/promises';
import { isAbsolute, posix, relative, resolve } from 'node:path';

import type { ICruiseResult } from 'dependency-cruiser';

import { cruiseProject, type DepcruisePhase } from './cruise/index.js';
import type { ModuleRules, VisualizationConfig, VizSummary } from './types.js';

export { cruiseProject, type DepcruisePhase };

export type FileDependencyEdge = {
  fromFile: string;
  toFile: string;
};

export type FileDependencyGroup = {
  counterpart: string;
  count: number;
  edges: FileDependencyEdge[];
};

export type DepsAnalysis = {
  baseDir: string;
  targetPath: string;
  incoming: FileDependencyGroup[];
  outgoing: FileDependencyGroup[];
  insights: {
    entryPoint: {
      verdict: 'no-incoming' | 'single-index' | 'deep-imports';
      entryFile: string | null;
      offenders: string[];
    };
    suggestedRules: Pick<
      ModuleRules,
      'leaf' | 'onlyImportedBy' | 'onlyImports'
    >;
    config: {
      declaredModule: {
        path: string;
        name: string;
        layer: string;
      } | null;
      layer: string | null;
    };
  };
};

export type FilesAnalysis = {
  baseDir: string;
  stats: {
    totalFiles: number;
    layerCoveredFiles: number;
    moduleCoveredFiles: number;
    orphanedFiles: number;
    coveredByLayerButNoModuleFiles: number;
    ignoredFiles: number;
  };
  problems: {
    orphaned: string[];
    moduleGaps: string[];
    ignored: string[];
  };
  covered: Array<{
    layer: string;
    files: string[];
    modules: Array<{
      module: string;
      files: string[];
    }>;
    filesWithoutModule: string[];
  }>;
};

type VizModule = NonNullable<VisualizationConfig['modules']>[number];

/** A declared module paired with its normalized (cruise-relative) path. */
type NormalizedModule = { entry: VizModule; path: string };

/** Analyze file-level imports crossing the boundary of `targetPath`. */
export async function analyzeDeps(
  baseDir: string,
  targetPath: string,
): Promise<DepsAnalysis> {
  const result = await cruiseProject(baseDir);
  const realBaseDir = await realpath(baseDir).catch(() => resolve(baseDir));
  const target = normalizeTargetPath(baseDir, targetPath);
  const { incoming, outgoing } = collectBoundaryEdges({
    baseDir: realBaseDir,
    cruiseResult: result.cruiseResult,
    ignorePatterns: (result.config.ignore ?? []).map(pathToRegExp),
    targetPath: target,
  });

  return {
    baseDir,
    targetPath: target.length === 0 ? '.' : target,
    incoming: groupEdges(incoming, 'incoming'),
    outgoing: groupEdges(outgoing, 'outgoing'),
    insights: {
      entryPoint: analyzeEntryPoint({
        incoming,
        targetPath: target,
      }),
      suggestedRules: suggestModuleRules({
        incoming,
        outgoing,
        modules: result.config.modules ?? [],
      }),
      config: {
        declaredModule: findDeclaredModule(target, result.config),
        layer: findCoveringLayer(target, result.config),
      },
    },
  };
}

/** Analyze layer/module file inventory from a cruised project summary. */
export async function analyzeFiles(baseDir: string): Promise<FilesAnalysis> {
  const result = await cruiseProject(baseDir);
  return buildFilesAnalysis(baseDir, result.summary);
}

function collectBoundaryEdges({
  baseDir,
  cruiseResult,
  ignorePatterns,
  targetPath,
}: {
  baseDir: string;
  cruiseResult: ICruiseResult;
  ignorePatterns: RegExp[];
  targetPath: string;
}): { incoming: FileDependencyEdge[]; outgoing: FileDependencyEdge[] } {
  const modules = (cruiseResult.modules ?? [])
    .map((mod) => ({
      ...mod,
      source: normalizeCruisePath(mod.source, baseDir),
    }))
    .filter(
      (mod) =>
        !isNodeModulesPath(mod.source) &&
        !isIgnored(mod.source, ignorePatterns),
    );
  const moduleSources = new Set(modules.map((mod) => mod.source));
  const incoming: FileDependencyEdge[] = [];
  const outgoing: FileDependencyEdge[] = [];

  for (const mod of modules) {
    const fromFile = mod.source;
    const fromInside = isInsidePath(fromFile, targetPath);

    for (const dep of mod.dependencies) {
      if (dep.couldNotResolve || dep.coreModule || !dep.resolved) continue;

      const toFile = normalizeCruisePath(dep.resolved, baseDir);
      if (
        !moduleSources.has(toFile) ||
        isNodeModulesPath(toFile) ||
        isIgnored(toFile, ignorePatterns)
      ) {
        continue;
      }

      const toInside = isInsidePath(toFile, targetPath);
      if (!fromInside && toInside) {
        incoming.push({ fromFile, toFile });
      } else if (fromInside && !toInside) {
        outgoing.push({ fromFile, toFile });
      }
    }
  }

  return {
    incoming: sortEdges(incoming),
    outgoing: sortEdges(outgoing),
  };
}

function groupEdges(
  edges: FileDependencyEdge[],
  direction: 'incoming' | 'outgoing',
): FileDependencyGroup[] {
  const groups = new Map<string, FileDependencyEdge[]>();
  for (const edge of edges) {
    const counterpart = direction === 'incoming' ? edge.fromFile : edge.toFile;
    const key = topLevelFolder(counterpart);
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }

  return [...groups.entries()]
    .map(([counterpart, groupEdges]) => ({
      counterpart,
      count: groupEdges.length,
      edges: groupEdges,
    }))
    .sort(
      (a, b) => b.count - a.count || a.counterpart.localeCompare(b.counterpart),
    );
}

function analyzeEntryPoint({
  incoming,
  targetPath,
}: {
  incoming: FileDependencyEdge[];
  targetPath: string;
}): DepsAnalysis['insights']['entryPoint'] {
  const incomingTargets = [
    ...new Set(incoming.map((edge) => edge.toFile)),
  ].sort((a, b) => a.localeCompare(b));

  if (incomingTargets.length === 0) {
    return { verdict: 'no-incoming', entryFile: null, offenders: [] };
  }

  const directIndexes = incomingTargets.filter((file) =>
    isDirectIndexInsideTarget(file, targetPath),
  );
  const entryFile = directIndexes.length === 1 ? directIndexes[0]! : null;
  const singleIndex = entryFile !== null && incomingTargets.length === 1;

  return {
    verdict: singleIndex ? 'single-index' : 'deep-imports',
    entryFile,
    offenders: incomingTargets.filter((file) => file !== entryFile),
  };
}

function suggestModuleRules({
  incoming,
  outgoing,
  modules,
}: {
  incoming: FileDependencyEdge[];
  outgoing: FileDependencyEdge[];
  modules: readonly VizModule[];
}): DepsAnalysis['insights']['suggestedRules'] {
  const normalized = modules.map((entry) => ({
    entry,
    path: normalizeCruisePath(entry.path),
  }));
  const onlyImportedBy = ruleRefsForFiles(
    incoming.map((edge) => edge.fromFile),
    normalized,
  );
  const onlyImports = ruleRefsForFiles(
    outgoing.map((edge) => edge.toFile),
    normalized,
  );
  return onlyImports.length === 0
    ? { onlyImportedBy, leaf: true }
    : { onlyImportedBy, onlyImports };
}

function ruleRefsForFiles(
  files: readonly string[],
  modules: readonly NormalizedModule[],
): string[] {
  return [
    ...new Set(
      files.map(
        (file) => findContainingModule(file, modules)?.path ?? dirName(file),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function findDeclaredModule(
  targetPath: string,
  config: VisualizationConfig,
): DepsAnalysis['insights']['config']['declaredModule'] {
  const module = (config.modules ?? []).find(
    (entry) => normalizeCruisePath(entry.path) === targetPath,
  );
  return module
    ? {
        path: module.path,
        name: module.name,
        layer: module.layer,
      }
    : null;
}

function findCoveringLayer(
  targetPath: string,
  config: VisualizationConfig,
): string | null {
  for (const stack of config.stacks) {
    for (const layer of stack.layers) {
      for (const path of layer.paths) {
        const layerPath = normalizeCruisePath(path);
        if (
          targetPath === layerPath ||
          targetPath.startsWith(layerPath + '/')
        ) {
          return layer.name;
        }
      }
    }
  }
  return null;
}

function findContainingModule(
  file: string,
  modules: readonly NormalizedModule[],
): VizModule | undefined {
  let best: NormalizedModule | undefined;
  for (const module of modules) {
    const { path } = module;
    if (file === path || file.startsWith(path + '/')) {
      if (!best || path.length > best.path.length) {
        best = module;
      }
    }
  }
  return best?.entry;
}

function buildFilesAnalysis(
  baseDir: string,
  summary: VizSummary,
): FilesAnalysis {
  const layerCoveredFiles = summary.coveredFiles.reduce(
    (count, layer) => count + layer.files.length,
    0,
  );
  const moduleCoveredFiles = summary.moduleCoverage.reduce(
    (count, module) => count + module.files.length,
    0,
  );

  return {
    baseDir,
    stats: {
      totalFiles:
        layerCoveredFiles +
        summary.layerOrphanFiles.length +
        summary.ignoredFiles.length,
      layerCoveredFiles,
      moduleCoveredFiles,
      orphanedFiles: summary.layerOrphanFiles.length,
      coveredByLayerButNoModuleFiles: summary.coverageGaps.length,
      ignoredFiles: summary.ignoredFiles.length,
    },
    problems: {
      orphaned: sortFiles(summary.layerOrphanFiles),
      moduleGaps: sortFiles(summary.coverageGaps),
      ignored: sortFiles(summary.ignoredFiles),
    },
    covered: summary.coveredFiles.map((layer) => {
      const modules = summary.moduleCoverage
        .filter((module) => module.layer === layer.layer)
        .map((module) => ({
          module: module.module,
          files: sortFiles(module.files),
        }))
        .sort((a, b) => a.module.localeCompare(b.module));
      const moduleFiles = new Set(modules.flatMap((module) => module.files));

      return {
        layer: layer.layer,
        files: sortFiles(layer.files),
        modules,
        filesWithoutModule: sortFiles(
          layer.files.filter((file) => !moduleFiles.has(file)),
        ),
      };
    }),
  };
}

function normalizeTargetPath(baseDir: string, targetPath: string): string {
  const path = isAbsolute(targetPath)
    ? relative(baseDir, targetPath)
    : targetPath;
  return normalizeCruisePath(path);
}

function normalizeCruisePath(path: string, baseDir?: string): string {
  const pathWithSlashes = path.replace(/\\/g, '/');
  if (
    baseDir !== undefined &&
    (isAbsolute(pathWithSlashes) || pathWithSlashes.startsWith('../'))
  ) {
    const candidates = [
      resolve(baseDir, pathWithSlashes),
      resolve('/', pathWithSlashes),
    ];
    for (const candidate of candidates) {
      const relativePath = relative(baseDir, candidate);
      if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
        return normalizeCruisePath(relativePath);
      }
    }
  }

  const normalized = posix.normalize(pathWithSlashes);
  if (normalized === '.' || normalized === '') return '';
  return normalized.replace(/^\.\//, '').replace(/\/$/, '');
}

function isInsidePath(file: string, targetPath: string): boolean {
  return (
    targetPath.length === 0 ||
    file === targetPath ||
    file.startsWith(targetPath + '/')
  );
}

function isDirectIndexInsideTarget(file: string, targetPath: string): boolean {
  if (!isInsidePath(file, targetPath)) return false;
  const relativeFile =
    targetPath.length === 0
      ? file
      : file === targetPath
        ? posix.basename(file)
        : file.slice(targetPath.length + 1);
  return (
    !relativeFile.includes('/') && /^index\.[cm]?[jt]sx?$/.test(relativeFile)
  );
}

function isNodeModulesPath(path: string): boolean {
  return (
    path === 'node_modules' ||
    path.startsWith('node_modules/') ||
    path.includes('/node_modules/')
  );
}

function isIgnored(filePath: string, ignorePatterns: RegExp[]): boolean {
  return ignorePatterns.some((re) => re.test(filePath));
}

function pathToRegExp(path: string): RegExp {
  const escaped = normalizeCruisePath(path).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  return new RegExp(`^${escaped}(/|$)`);
}

function topLevelFolder(path: string): string {
  const [first] = path.split('/');
  return first && first.length > 0 ? first : '.';
}

function dirName(path: string): string {
  const dir = posix.dirname(path);
  return dir === '.' ? '.' : dir;
}

function sortEdges(edges: readonly FileDependencyEdge[]): FileDependencyEdge[] {
  const unique = new Map<string, FileDependencyEdge>();
  for (const edge of edges) {
    unique.set(`${edge.fromFile}\0${edge.toFile}`, edge);
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.fromFile.localeCompare(b.fromFile) || a.toFile.localeCompare(b.toFile),
  );
}

function sortFiles(files: readonly string[]): string[] {
  return [...files].sort((a, b) => a.localeCompare(b));
}
