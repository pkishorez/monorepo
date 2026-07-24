import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach } from 'vitest';

import { extractFileGraph } from '../src/architecture/extract-dependencies/index.js';
import { laymosDescribe, laymosTest } from '../src/tests/authoring/index.js';

type ExtractScenario = 'configured roots' | 'ignored files' | 'test files';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

laymosDescribe(
  'Dependency extraction',
  {
    description:
      'Discovers production TypeScript files and their internal dependencies.',
    documentation: `
## Extraction boundary

Only configured source files and directories enter architecture analysis.
Explicitly ignored files stay in the inventory but are not traversed, while
Vitest test and spec files never enter the production graph.
`,
  },
  () => {
    const cases = [
      [
        'analyzes only configured files and directories',
        'configured roots',
        {
          files: {
            'a.ts': { path: 'a.ts', imports: ['b.ts'] },
            'b.ts': { path: 'b.ts', imports: [] },
            'docs/example.ts': {
              path: 'docs/example.ts',
              imports: ['b.ts'],
            },
          },
        },
      ],
      [
        'keeps ignored files without traversing them',
        'ignored files',
        {
          files: {
            'app.ts': { path: 'app.ts', imports: [] },
            'generated/invalid.ts': {
              path: 'generated/invalid.ts',
              imports: [],
            },
          },
        },
      ],
      [
        'excludes Vitest files from production analysis',
        'test files',
        {
          files: {
            'src/account/index.ts': {
              path: 'src/account/index.ts',
              imports: [],
            },
          },
        },
      ],
    ] as const;

    for (const [name, scenario, expected] of cases) {
      laymosTest(name, { description: name }, async ({ expect }) => {
        expect(
          await extractScenario(scenario),
          'extracts the expected production file graph',
        ).toBe(json(expected));
      });
    }
  },
);

async function extractScenario(scenario: ExtractScenario): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'laymos-extract-'));
  temporaryDirectories.push(directory);
  if (scenario === 'configured roots') {
    await writeFile(join(directory, '.gitignore'), 'b.ts\n');
    await writeFile(
      join(directory, 'a.ts'),
      "import type { B } from './b.js';\nimport './ignored.js';\nexport type A = B;\n",
    );
    await writeFile(join(directory, 'b.ts'), 'export interface B {}\n');
    await writeFile(
      join(directory, 'ignored.ts'),
      'export const ignored = true;\n',
    );
    await writeFile(join(directory, 'notes.md'), '# Notes\n');
    await mkdir(join(directory, 'docs'));
    await writeFile(
      join(directory, 'docs', 'example.ts'),
      "import type { B } from '../b.js';\nexport type Example = B;\n",
    );
    return json(
      await Effect.runPromise(
        extractFileGraph(directory, ['a.ts', 'b.ts', 'docs']),
      ),
    );
  }
  if (scenario === 'ignored files') {
    await mkdir(join(directory, 'generated'));
    await writeFile(
      join(directory, 'app.ts'),
      "import './generated/invalid.js';\nexport const app = true;\n",
    );
    await writeFile(
      join(directory, 'generated', 'invalid.ts'),
      'this is not valid TypeScript }}}',
    );
    return json(
      await Effect.runPromise(
        extractFileGraph(directory, ['.'], ['generated']),
      ),
    );
  }

  await mkdir(join(directory, 'src', 'account'), { recursive: true });
  await writeFile(
    join(directory, 'src', 'account', 'index.ts'),
    'export const account = true;\n',
  );
  await writeFile(
    join(directory, 'src', 'account', 'account.test.ts'),
    "import { account } from './index.js';\nexport const tested = account;\n",
  );
  await writeFile(
    join(directory, 'src', 'account', 'account.spec.ts'),
    "import { account } from './index.js';\nexport const specified = account;\n",
  );
  return json(await Effect.runPromise(extractFileGraph(directory, ['src'])));
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
