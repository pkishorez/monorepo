import { dirname, resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem } from 'effect';

import type {
  ArchitectureAnalysis,
  Config,
  Documentation,
  DocumentationScope,
} from '../../architecture-analysis-schema/index.js';
import { analyzeArchitecture } from '../../domain/architecture-analysis/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { loadProject } from '../load-project/index.js';
import {
  DocumentationReadError,
  DocumentationScopeNotFound,
} from './errors.js';

export {
  DocumentationReadError,
  DocumentationScopeNotFound,
} from './errors.js';

export function loadDocumentation(
  configPath: string,
  scope: DocumentationScope,
) {
  const absoluteConfigPath = resolve(configPath);
  const baseDir = dirname(absoluteConfigPath);

  return Effect.gen(function* () {
    const { config, fileGraph } = yield* loadProject(absoluteConfigPath);
    const analysis = analyzeArchitecture(fileGraph, config);
    const fileSystem = yield* FileSystem.FileSystem;

    const declaredPath = yield* resolveDeclaredPath(config, scope, analysis);
    if (declaredPath === undefined) {
      return {
        scope,
        path: undefined,
        content: undefined,
      } satisfies Documentation;
    }

    const content = yield* fileSystem
      .readFileString(resolve(baseDir, declaredPath))
      .pipe(
        Effect.catchIf(
          (cause) =>
            scope.kind === 'module' && cause.reason._tag === 'NotFound',
          () => Effect.succeed<string | undefined>(undefined),
        ),
        Effect.mapError(
          (cause) => new DocumentationReadError({ path: declaredPath, cause }),
        ),
      );

    return {
      scope,
      path: content === undefined ? undefined : declaredPath,
      content,
    } satisfies Documentation;
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

function resolveDeclaredPath(
  config: Config,
  scope: DocumentationScope,
  analysis: ArchitectureAnalysis,
) {
  switch (scope.kind) {
    case 'module': {
      const module = analysis.moduleAnalysis.modules.find(
        ({ path }) => path === scope.modulePath,
      );
      if (module === undefined) {
        return Effect.fail(new DocumentationScopeNotFound({ scope }));
      }
      return Effect.succeed(
        module.shape === 'directory' ? `${module.path}/README.md` : undefined,
      );
    }
    case 'module-graph': {
      const graph = config.layers[scope.layerId]?.moduleGraphs[scope.graphId];
      if (graph === undefined) {
        return Effect.fail(new DocumentationScopeNotFound({ scope }));
      }
      return Effect.succeed(graph.docsPath);
    }
    case 'layer': {
      const layer = config.layers[scope.layerId];
      if (layer === undefined) {
        return Effect.fail(new DocumentationScopeNotFound({ scope }));
      }
      return Effect.succeed(layer.docsPath);
    }
    case 'layer-graph': {
      const layerGraph = config.layerGraphs[scope.graphId];
      if (layerGraph === undefined) {
        return Effect.fail(new DocumentationScopeNotFound({ scope }));
      }
      return Effect.succeed(layerGraph.docsPath);
    }
  }
}
