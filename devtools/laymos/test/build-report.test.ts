import { Effect } from 'effect';
import { describe } from 'vitest';

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

describe('Laymos', () => {
  laymosDescribe(
    'Build Report',
    {
      description:
        'Builds the serializable architecture report consumed by every Laymos surface.',
      documentation: `
# The public architecture handoff

The report is the stable handoff between static analysis and every consumer.
It removes internal paths and references while preserving architecture, files,
violations, coverage, and warnings.
`,
    },
    () => {
      laymosTest(
        'Emits the normalized domain report.',
        {
          description:
            'Resolved architecture references become one data-only representation.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const actual = yield* trace(buildReport(resolved, evaluation));

            expect(
              actual,
              'The report preserves the normalized architecture, files, rules, and coverage.',
            ).toEqual(expected);
            expect(
              trace.getSpanCount({ name: 'report.build', status: 'success' }),
              'The report handoff is retained as one successful build trace.',
            ).toBe(1);
          }),
      );

      laymosTest(
        'Preserves warnings and uncovered file state.',
        {
          description:
            'Non-fatal analysis findings remain explicit public report data.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const actual = yield* trace(
              buildReport(
                {
                  ...resolved,
                  fileGraph: {
                    files: {
                      ...resolved.fileGraph.files,
                      'src/orphan.ts': {
                        path: 'src/orphan.ts',
                        imports: [],
                      },
                    },
                  },
                  files: {
                    ...resolved.files,
                    'src/orphan.ts': {
                      kind: 'uncovered',
                      path: 'src/orphan.ts',
                    },
                  },
                },
                {
                  ...evaluation,
                  coverage: {
                    ...evaluation.coverage,
                    layers: {
                      totalFiles: 3,
                      coveredFiles: 2,
                      uncovered: ['src/orphan.ts'],
                    },
                  },
                },
                [{ kind: 'missing-source-root', path: 'generated' }],
              ),
            );

            expect(
              actual.files['src/orphan.ts'],
              'The uncovered source remains visible without internal path metadata.',
            ).toEqual({ kind: 'uncovered', imports: [] });
            expect(
              actual.warnings,
              'The missing source root remains a non-fatal report warning.',
            ).toEqual([{ kind: 'missing-source-root', path: 'generated' }]);
          }),
      );
    },
  );
});
