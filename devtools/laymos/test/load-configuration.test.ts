import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import { afterEach, describe } from 'vitest';

import { loadConfig } from '../src/config/load-config/index.js';
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
    'Load Configuration',
    {
      description:
        'Loads, validates, and normalizes the configuration at a project root.',
      documentation: `
# Loading a project configuration

Static analysis begins by locating \`laymos.config.ts\` in the selected project.
Laymos executes its default export, checks the complete runtime shape, and then
applies the semantic rules documented by Define Configuration.

Callers receive the normalized configuration on success. A missing file, an
import failure, and an invalid value remain distinct typed failures so command
line and Node consumers can explain the right corrective action.
`,
    },
    () => {
      laymosTest(
        'Loads and normalizes a valid project configuration.',
        {
          description:
            'A valid default export becomes the canonical configuration used by analysis.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await writeFile(
            join(projectDir, 'laymos.config.ts'),
            `const app = { kind: 'layer', name: 'app', paths: ['./src/'], description: 'Application' } as const;
const core = { kind: 'layer', name: 'core', paths: ['src/core'], description: 'Core' } as const;
export default {
  sourceRoots: ['./src/'],
  graphs: [{
    kind: 'layer-graph',
    name: 'application',
    description: 'Application architecture',
    layers: [app, core],
    edges: [{ from: app, to: core }],
  }],
};`,
          );

          const actual = await Effect.runPromise(
            trace(loadConfig({ projectDir })),
          );

          expect(
            actual.sourceRoots,
            'The loaded source root uses its normalized path.',
          ).toEqual(['src']);
          expect(
            trace.getSpanCount({ name: 'config.load', status: 'success' }),
            'The successful load is retained as one configuration trace.',
          ).toBe(1);
        },
      );

      laymosTest(
        'Fails when the project has no configuration file.',
        {
          description:
            'A missing project-root configuration remains distinguishable from invalid content.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();

          const failure = await Effect.runPromise(
            trace(loadConfig({ projectDir })).pipe(Effect.flip),
          );

          expect(
            failure._tag,
            'The caller receives the public missing-configuration error.',
          ).toBe('ConfigNotFoundError');
          expect(
            trace.getSpanCount({ name: 'config.load', status: 'error' }),
            'The failed lookup is retained as one configuration trace.',
          ).toBe(1);
        },
      );

      laymosTest(
        'Fails when configuration execution throws.',
        {
          description:
            'Syntax and runtime failures are reported as import failures rather than validation failures.',
        },
        async ({ expect, trace }) => {
          const projectDir = await temporaryProject();
          await writeFile(
            join(projectDir, 'laymos.config.ts'),
            `throw new Error('configuration exploded');`,
          );

          const failure = await Effect.runPromise(
            trace(loadConfig({ projectDir })).pipe(Effect.flip),
          );

          expect(
            failure._tag,
            'The caller receives the public configuration-import error.',
          ).toBe('ConfigImportError');
        },
      );

      for (const [name, source] of invalidConfigurations) {
        laymosTest(
          name,
          {
            description:
              'Malformed runtime configuration fails through the stable validation boundary.',
          },
          async ({ expect, trace }) => {
            const projectDir = await temporaryProject();
            await writeFile(join(projectDir, 'laymos.config.ts'), source);

            const failure = await Effect.runPromise(
              trace(loadConfig({ projectDir })).pipe(Effect.flip),
            );

            expect(
              failure._tag,
              'The caller receives the public configuration-validation error.',
            ).toBe('ConfigValidationError');
          },
        );
      }
    },
  );
});

const invalidConfigurations = [
  ['Rejects a module without a default export.', `export const config = {};`],
  [
    'Rejects malformed Layer Graphs.',
    `export default {
  sourceRoots: ['src'],
  graphs: [{ kind: 'layer-graph' }],
};`,
  ],
  [
    'Rejects non-string source roots.',
    `export default {
  sourceRoots: [42],
  graphs: [],
};`,
  ],
  [
    'Rejects malformed Module paths.',
    `export default {
  sourceRoots: ['src'],
  graphs: [],
  modules: [{ kind: 'module', path: 42, description: 'Invalid module' }],
};`,
  ],
  [
    'Rejects malformed Project Narratives.',
    `export default {
  sourceRoots: ['src'],
  graphs: [],
  project: { kind: 'project-narrative', name: 'Example', content: 'not markdown' },
};`,
  ],
] as const;

async function temporaryProject(): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), 'laymos-config-'));
  temporaryDirectories.push(projectDir);
  return projectDir;
}
