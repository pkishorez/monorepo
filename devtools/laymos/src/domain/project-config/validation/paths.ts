import { posix } from 'node:path';

import type { Config, ConfigValidationIssue } from '../project-config.js';

interface ConfigPath {
  readonly location: string;
  readonly path: string;
}

export function findInvalidPaths(
  config: Config,
): readonly ConfigValidationIssue[] {
  return configPaths(config)
    .filter(({ path }) => !isCanonicalProjectPath(path))
    .map(({ location, path }) => ({
      kind: 'path' as const,
      message: `${location} must be a canonical project-relative path: ${JSON.stringify(path)}`,
    }));
}

function configPaths(config: Config): readonly ConfigPath[] {
  return [
    ...config.sourceRoots.map((path, index) => ({
      location: `sourceRoots[${index}]`,
      path,
    })),
    ...config.ignoredPaths.map((path, index) => ({
      location: `ignoredPaths[${index}]`,
      path,
    })),
    ...Object.entries(config.layers).flatMap(([layer, value]) => [
      ...value.paths.map((path, index) => ({
        location: `layers.${layer}.paths[${index}]`,
        path,
      })),
      ...(value.docsPath === undefined
        ? []
        : [{ location: `layers.${layer}.docsPath`, path: value.docsPath }]),
      ...Object.entries(value.moduleGraphs).flatMap(([graph, graphValue]) =>
        graphValue.docsPath === undefined
          ? []
          : [
              {
                location: `layers.${layer}.moduleGraphs.${graph}.docsPath`,
                path: graphValue.docsPath,
              },
            ],
      ),
    ]),
    ...Object.entries(config.layerGraphs).flatMap(([graph, value]) =>
      value.docsPath === undefined
        ? []
        : [{ location: `layerGraphs.${graph}.docsPath`, path: value.docsPath }],
    ),
  ];
}

function isCanonicalProjectPath(path: string): boolean {
  if (path === '.') return true;
  if (
    path.length === 0 ||
    path.includes('\\') ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.startsWith('../') ||
    path === '..' ||
    /^[A-Za-z]:/.test(path)
  ) {
    return false;
  }
  return posix.normalize(path) === path;
}
