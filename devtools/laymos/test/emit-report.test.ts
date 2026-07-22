import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { edge, layer, layerGraph } from '../src/config/index.js';
import type { ResolvedProject } from '../src/engine/2-resolve/index.js';
import type { Evaluation } from '../src/engine/3-evaluate/index.js';
import { emitReport } from '../src/engine/4-emit/index.js';

const app = layer('app', ['src/app']);
const domain = layer('domain', ['src/domain']);

const resolved: ResolvedProject = {
  config: {
    sourceRoots: ['src'],
    graphs: [layerGraph('application', [edge(app, domain)])],
  },
  fileGraph: {
    files: {
      'src/app/index.ts': {
        path: 'src/app/index.ts',
        imports: ['src/domain/model.ts'],
      },
      'src/domain/model.ts': {
        path: 'src/domain/model.ts',
        imports: [],
      },
    },
  },
  files: {
    'src/app/index.ts': {
      kind: 'covered',
      path: 'src/app/index.ts',
      layer: 'app',
    },
    'src/domain/model.ts': {
      kind: 'covered',
      path: 'src/domain/model.ts',
      layer: 'domain',
    },
  },
  reachability: { app: ['domain'], domain: [] },
};

const evaluation: Evaluation = {
  violations: [],
  coverage: {
    layers: { totalFiles: 2, coveredFiles: 2, uncovered: [] },
    modules: [],
  },
};

describe('emitReport', () => {
  it('emits one normalized, serializable domain report', () => {
    const report = Effect.runSync(emitReport(resolved, evaluation));
    expect(report).toEqual({
      schemaVersion: 2,
      architecture: {
        sourceRoots: ['src'],
        layers: {
          app: { paths: ['src/app'] },
          domain: { paths: ['src/domain'] },
        },
        graphs: [
          {
            name: 'application',
            layers: ['app', 'domain'],
            edges: [{ from: 'app', to: 'domain' }],
          },
        ],
        modules: {},
        moduleRules: [],
        ignoredPaths: [],
      },
      files: {
        'src/app/index.ts': {
          kind: 'covered',
          layer: 'app',
          imports: ['src/domain/model.ts'],
        },
        'src/domain/model.ts': {
          kind: 'covered',
          layer: 'domain',
          imports: [],
        },
      },
      violations: [],
      coverage: evaluation.coverage,
      warnings: [],
    });
  });
});
