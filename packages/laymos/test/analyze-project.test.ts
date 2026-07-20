import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { analyzeProjectPromise } from '../src/node.js';

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
      `const app = { kind: 'layer', name: 'app', paths: ['src/app'] } as const;
const domain = { kind: 'layer', name: 'domain', paths: ['src/domain'] } as const;
const future = { kind: 'layer', name: 'future', paths: ['src/future'] } as const;
export default {
  graphs: [{
    kind: 'layer-graph',
    name: 'application',
    layers: [app, domain, future],
    edges: [{ from: app, to: domain }, { from: app, to: future }],
  }],
  ignore: ['laymos.config.ts'],
};
`,
    );

    const report = await analyzeProjectPromise(directory);

    expect(report.coverage.layers).toEqual({
      totalFiles: 2,
      coveredFiles: 2,
      uncovered: [],
    });
    expect(report.files['laymos.config.ts']).toEqual({
      kind: 'ignored',
      imports: [],
    });
    expect(report.violations).toEqual([
      {
        kind: 'layer',
        from: { layer: 'domain', file: 'src/domain/index.ts' },
        to: { layer: 'app', file: 'src/app/index.ts' },
      },
    ]);
    expect(report.warnings).toEqual([
      {
        kind: 'missing-layer-path',
        layer: 'future',
        path: 'src/future',
      },
    ]);
  });
});
