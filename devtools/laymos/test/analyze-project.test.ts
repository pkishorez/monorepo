import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import { analyzeProject } from '../src/node.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('analyzeProject', () => {
  it('loads config and runs the complete static pipeline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'laymos-project-'));
    temporaryDirectories.push(directory);
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    await mkdir(join(directory, 'src/app'), { recursive: true });
    await mkdir(join(directory, 'src/domain'), { recursive: true });
    await writeFile(
      join(directory, 'src/app/index.ts'),
      "import { domain } from '../domain/index.js';\nexport const app = domain;\n",
    );
    await writeFile(
      join(directory, 'src/domain/index.ts'),
      "import { app } from '../app/index.js';\nexport const domain = app;\n",
    );
    await writeFile(
      join(directory, 'laymos.config.ts'),
      `const app = { kind: 'layer', name: 'app', paths: ['src/app'], description: 'App' } as const;
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
};
`,
    );

    const report = await Effect.runPromise(analyzeProject(directory));

    expect(report.coverage.layers).toEqual({
      totalFiles: 2,
      coveredFiles: 2,
      uncovered: [],
    });
    expect(report.architecture.sourceRoots).toEqual(['src', 'missing-root']);
    expect(report.violations).toEqual([
      {
        kind: 'layer',
        from: { layer: 'domain', file: 'src/domain/index.ts' },
        to: { layer: 'app', file: 'src/app/index.ts' },
      },
    ]);
    expect(report.warnings).toEqual([
      {
        kind: 'missing-source-root',
        path: 'missing-root',
      },
      {
        kind: 'missing-layer-path',
        layer: 'future',
        path: 'src/future',
      },
    ]);
  });

  it('isolates Module Story surfaces from the static report', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'laymos-project-'));
    temporaryDirectories.push(directory);
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    await mkdir(join(directory, 'src/account/stories'), { recursive: true });
    await writeFile(
      join(directory, 'src/account/index.ts'),
      "import { fixture } from './stories/support.js';\nexport const account = fixture;\n",
    );
    await writeFile(
      join(directory, 'src/account/stories/account.story.ts'),
      "import { account } from '../index.js';\nexport const story = account;\n",
    );
    await writeFile(
      join(directory, 'src/account/stories/support.ts'),
      'export const fixture = true;\n',
    );
    await writeFile(
      join(directory, 'laymos.config.ts'),
      `const app = { kind: 'layer', name: 'app', paths: ['src'], description: 'App' } as const;
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
};
`,
    );

    const report = await Effect.runPromise(analyzeProject(directory));

    expect(report.files).toEqual({
      'src/account/index.ts': {
        kind: 'covered',
        layer: 'app',
        module: 'src/account',
        imports: [],
      },
    });
    expect(report.violations).toEqual([
      {
        kind: 'story-import',
        from: { file: 'src/account/index.ts' },
        to: {
          module: 'src/account',
          file: 'src/account/stories/support.ts',
        },
      },
    ]);
    expect(report.coverage).toEqual({
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
  });
});
