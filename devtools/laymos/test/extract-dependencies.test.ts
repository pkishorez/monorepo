import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, describe } from 'vitest';

import { extractFileGraph } from '../src/architecture/extract-dependencies/index.js';
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
    'Extract Dependencies',
    {
      description:
        'Discovers production source files and the internal imports between them.',
      documentation: `
# Building the factual file graph

After configuration is loaded, Laymos inventories supported source beneath the
configured roots and asks Skott to follow internal imports. Type-only imports
are architecture dependencies too. Third-party and built-in imports do not
belong to the project graph.

Explicitly ignored files remain visible so later stages can report them as
ignored, but their contents and edges are never traversed. Test, declaration,
minified, and unsupported files stay outside production architecture entirely.
`,
    },
    () => {
      laymosTest(
        'Extracts configured files and type-only internal imports.',
        {
          description:
            'File roots and directory roots contribute one deterministic production graph.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await mkdir(join(projectDir, 'docs'));
          await writeFile(
            join(projectDir, 'a.ts'),
            "import type { B } from './b.js';\nimport 'node:path';\nexport type A = B;\n",
          );
          await writeFile(join(projectDir, 'b.ts'), 'export interface B {}\n');
          await writeFile(
            join(projectDir, 'docs/example.ts'),
            "import type { B } from '../b.js';\nexport type Example = B;\n",
          );

          const actual = await Effect.runPromise(
            trace(extractFileGraph(projectDir, ['a.ts', 'b.ts', 'docs'])),
          );

          expect(
            actual,
            'The graph contains configured production files and only their internal imports.',
          ).toEqual({
            files: {
              'a.ts': { path: 'a.ts', imports: ['b.ts'] },
              'b.ts': { path: 'b.ts', imports: [] },
              'docs/example.ts': {
                path: 'docs/example.ts',
                imports: ['b.ts'],
              },
            },
          });
          expect(
            trace.getSpanCount({
              name: 'dependencies.extract',
              status: 'success',
            }),
            'The extraction is retained as one successful dependency trace.',
          ).toBe(1);
        },
      );

      laymosTest(
        'Keeps ignored files without traversing their contents.',
        {
          description:
            'Ignored source remains auditable even when it contains invalid syntax or imports.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await mkdir(join(projectDir, 'generated'));
          await writeFile(
            join(projectDir, 'app.ts'),
            "import './generated/invalid.js';\nexport const app = true;\n",
          );
          await writeFile(
            join(projectDir, 'generated/invalid.ts'),
            'this is not valid TypeScript }}}',
          );

          const actual = await Effect.runPromise(
            trace(extractFileGraph(projectDir, ['.'], ['generated'])),
          );

          expect(
            actual,
            'The ignored file remains visible while its incoming and outgoing edges are absent.',
          ).toEqual({
            files: {
              'app.ts': { path: 'app.ts', imports: [] },
              'generated/invalid.ts': {
                path: 'generated/invalid.ts',
                imports: [],
              },
            },
          });
        },
      );

      laymosTest(
        'Excludes test and specification files from production analysis.',
        {
          description:
            'Vitest sources cannot affect architecture ownership, rules, or coverage.',
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
            join(projectDir, 'src/account/account.spec.tsx'),
            "import { account } from './index.js';\nexport const specified = account;\n",
          );

          const actual = await Effect.runPromise(
            trace(extractFileGraph(projectDir, ['src'])),
          );

          expect(
            Object.keys(actual.files),
            'Only the production account source enters the file graph.',
          ).toEqual(['src/account/index.ts']);
        },
      );

      laymosTest(
        'Excludes declarations, minified scripts, and unsupported files.',
        {
          description:
            'Only editable JavaScript and TypeScript source participates in architecture.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await writeFile(
            join(projectDir, 'app.ts'),
            'export const app = true;\n',
          );
          await writeFile(
            join(projectDir, 'types.d.ts'),
            'export type Id = string;\n',
          );
          await writeFile(join(projectDir, 'vendor.min.js'), 'export{}');
          await writeFile(join(projectDir, 'notes.md'), '# Notes\n');

          const actual = await Effect.runPromise(
            trace(extractFileGraph(projectDir, ['.'])),
          );

          expect(
            Object.keys(actual.files),
            'Only the supported non-generated application source is analyzed.',
          ).toEqual(['app.ts']);
        },
      );

      laymosTest(
        'Returns an empty graph when every source root is missing.',
        {
          description:
            'Missing roots are warning material for project analysis, not extraction failures.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();

          const actual = await Effect.runPromise(
            trace(extractFileGraph(projectDir, ['missing'])),
          );

          expect(
            actual.files,
            'A missing source boundary contributes no production files.',
          ).toEqual({});
        },
      );
    },
  );
});

async function temporaryProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), 'laymos-extract-'));
  temporaryDirectories.push(projectDir);
  return projectDir;
}
