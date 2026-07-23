import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { edge, layer, layerGraph } from '../src/config/index.js';
import type { ResolvedProject } from '../src/architecture/resolve-architecture/index.js';
import type { RuleValidation } from '../src/architecture/validate-rules/index.js';
import { buildReport } from '../src/architecture/build-report/index.js';

const app = layer('app', ['src/app'], { description: 'App' });
const domain = layer('domain', ['src/domain'], { description: 'Domain' });

const resolved: ResolvedProject = {
  config: {
    sourceRoots: ['src'],
    graphs: [
      layerGraph('application', [edge(app, domain)], {
        description: 'Application architecture',
      }),
    ],
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
    laymosImports: [],
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

const evaluation: RuleValidation = {
  violations: [],
  coverage: {
    layers: { totalFiles: 2, coveredFiles: 2, uncovered: [] },
    modules: [],
  },
};

describe('buildReport', () => {
  it('emits one normalized, serializable domain report', () => {
    const report = Effect.runSync(buildReport(resolved, evaluation));
    expect(report).toEqual({
      architecture: {
        sourceRoots: ['src'],
        layers: {
          app: { paths: ['src/app'], description: 'App' },
          domain: { paths: ['src/domain'], description: 'Domain' },
        },
        graphs: [
          {
            name: 'application',
            description: 'Application architecture',
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
