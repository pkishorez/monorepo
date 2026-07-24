import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, describe } from 'vitest';

import { analyzeProject } from '../src/entrypoints/node/index.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Laymos', () => {
  laymosDescribe(
    'Analyze Project',
    {
      description:
        'Runs the complete static architecture journey for one project.',
      documentation: `
# The static analysis composition root

Analyze Project connects every architecture capability: it loads configuration,
records missing physical paths as warnings, extracts production dependencies,
resolves file ownership, validates Layer and Module rules, and builds one
serializable report.

Configuration and extraction problems remain typed Effect failures. Architecture
violations, coverage gaps, and missing configured paths are successful report
data so consumers can present the whole state of the project at once.
`,
    },
    () => {
      laymosTest(
        'Reports the complete project architecture.',
        {
          description:
            'One analysis returns source ownership, violations, coverage, and missing-path warnings.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await mkdir(join(projectDir, 'src/app'), { recursive: true });
          await mkdir(join(projectDir, 'src/domain'), { recursive: true });
          await writeFile(
            join(projectDir, 'src/app/index.ts'),
            "import { domain } from '../domain/index.js';\nexport const app = domain;\n",
          );
          await writeFile(
            join(projectDir, 'src/domain/index.ts'),
            "import { app } from '../app/index.js';\nexport const domain = app;\n",
          );
          await writeFile(
            join(projectDir, 'laymos.config.ts'),
            completeConfiguration,
          );

          const report = await Effect.runPromise(
            trace(analyzeProject({ projectDir })),
          );

          expect(
            {
              coverage: report.coverage.layers,
              sourceRoots: report.architecture.sourceRoots,
              violations: report.violations,
              warnings: report.warnings,
            },
            'The report preserves every terminal result of the architecture journey.',
          ).toEqual({
            coverage: { totalFiles: 2, coveredFiles: 2, uncovered: [] },
            sourceRoots: ['src', 'missing-root'],
            violations: [
              {
                kind: 'layer',
                from: { layer: 'domain', file: 'src/domain/index.ts' },
                to: { layer: 'app', file: 'src/app/index.ts' },
              },
            ],
            warnings: [
              { kind: 'missing-source-root', path: 'missing-root' },
              {
                kind: 'missing-layer-path',
                layer: 'future',
                path: 'src/future',
              },
              {
                kind: 'missing-module-path',
                module: 'src/app/missing',
                path: 'src/app/missing',
              },
            ],
          });
          expect(
            trace.getSpanCount({ name: 'project.analyze', status: 'success' }),
            'The full project journey has one root analysis span.',
          ).toBe(1);
          expect(
            trace.getSpanCount({ status: 'success' }),
            'The root trace retains all six successful architecture stages.',
          ).toBe(6);
        },
      );

      laymosTest(
        'Excludes test files from the project report.',
        {
          description:
            'Test source never contributes files, imports, violations, or coverage.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await mkdir(join(projectDir, 'src/account'), { recursive: true });
          await writeFile(
            join(projectDir, 'src/account/index.ts'),
            'export const account = true;\n',
          );
          await writeFile(
            join(projectDir, 'src/account/account.test.ts'),
            "import { account } from './index.js';\nexport const tested = account;\n",
          );
          await writeFile(
            join(projectDir, 'laymos.config.ts'),
            accountConfiguration,
          );

          const report = await Effect.runPromise(
            trace(analyzeProject({ projectDir })),
          );

          expect(
            report.files,
            'Only the production Account file appears in the public report.',
          ).toEqual({
            'src/account/index.ts': {
              kind: 'covered',
              layer: 'app',
              module: 'src/account',
              imports: [],
            },
          });
          expect(
            report.coverage,
            'Test source does not change Layer or Module coverage.',
          ).toEqual({
            layers: { totalFiles: 1, coveredFiles: 1, uncovered: [] },
            modules: [
              {
                layer: 'app',
                totalFiles: 1,
                coveredFiles: 1,
                uncovered: [],
              },
            ],
          });
        },
      );

      laymosTest(
        'Returns an empty successful report for an empty source root.',
        {
          description:
            'A newly created project can establish architecture before adding production files.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await mkdir(join(projectDir, 'src'));
          await mkdir(join(projectDir, 'sink'));
          await writeFile(
            join(projectDir, 'laymos.config.ts'),
            emptyConfiguration,
          );

          const report = await Effect.runPromise(
            trace(analyzeProject({ projectDir })),
          );

          expect(
            {
              statusData: {
                files: report.files,
                violations: report.violations,
                warnings: report.warnings,
              },
              coverage: report.coverage.layers,
            },
            'An empty configured project has no findings and zero coverage totals.',
          ).toEqual({
            statusData: { files: {}, violations: [], warnings: [] },
            coverage: { totalFiles: 0, coveredFiles: 0, uncovered: [] },
          });
        },
      );
    },
  );
});

async function temporaryProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), 'laymos-project-'));
  temporaryDirectories.push(projectDir);
  execFileSync('git', ['init', '--quiet'], { cwd: projectDir });
  return projectDir;
}

const completeConfiguration = `const app = { kind: 'layer', name: 'app', paths: ['src/app'], description: 'Application' } as const;
const domain = { kind: 'layer', name: 'domain', paths: ['src/domain'], description: 'Domain' } as const;
const future = { kind: 'layer', name: 'future', paths: ['src/future'], description: 'Future' } as const;
export default {
  sourceRoots: ['src', 'missing-root'],
  graphs: [{
    kind: 'layer-graph',
    name: 'application',
    description: 'Application architecture',
    layers: [app, domain, future],
    edges: [{ from: app, to: domain }, { from: app, to: future }],
  }],
  modules: [{
    kind: 'module',
    path: 'src/app/missing',
    description: 'Missing application module',
  }],
};`;

const accountConfiguration = `const app = { kind: 'layer', name: 'app', paths: ['src'], description: 'Application' } as const;
export default {
  sourceRoots: ['src'],
  graphs: [{
    kind: 'layer-graph',
    name: 'application',
    description: 'Application architecture',
    layers: [app],
    edges: [],
  }],
  modules: [{
    kind: 'module',
    path: 'src/account',
    description: 'Account',
  }],
};`;

const emptyConfiguration = `const app = { kind: 'layer', name: 'app', paths: ['src'], description: 'Application' } as const;
const sink = { kind: 'layer', name: 'sink', paths: ['sink'], description: 'Sink' } as const;
export default {
  sourceRoots: ['src', 'sink'],
  graphs: [{
    kind: 'layer-graph',
    name: 'application',
    description: 'Application architecture',
    layers: [app, sink],
    edges: [{ from: app, to: sink }],
  }],
};`;
