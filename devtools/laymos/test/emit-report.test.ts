import { Effect } from 'effect';

import type { ResolvedProject } from '../src/architecture/resolve-architecture/index.js';
import type { RuleValidation } from '../src/architecture/validate-rules/index.js';
import { buildReport } from '../src/architecture/build-report/index.js';
import { edge, layer, layerGraph } from '../src/config/index.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

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

const expected = {
  architecture: {
    sourceRoots: ['src'],
    layers: {
      app: { paths: ['src/app'], description: 'App' },
      domain: { paths: ['src/domain'], description: 'Domain' },
    },
    graphs: [
      {
        name: 'application',
        layers: ['app', 'domain'],
        edges: [{ from: 'app', to: 'domain' }],
        description: 'Application architecture',
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
};

laymosDescribe(
  'Report construction',
  {
    description:
      'Builds the serializable report consumed by DevTools from resolved analysis.',
    documentation: `
## Report boundary

The report is the stable handoff between static analysis and every consumer.
It removes internal paths and references while preserving architecture, files,
violations, coverage, and warnings.
`,
  },
  () => {
    laymosTest(
      'emits the normalized domain report',
      {
        description:
          'Produces one serializable representation of the analysis.',
      },
      ({ expect }) => {
        const actual = JSON.stringify(
          Effect.runSync(buildReport(resolved, evaluation)),
        );
        expect(actual, 'matches the normalized report').toBe(
          JSON.stringify(expected),
        );
      },
    );
  },
);
