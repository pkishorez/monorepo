import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Effect } from 'effect';

import { ejectStories } from '../../../entrypoints/node/index.js';
import { story } from '../../authoring/index.js';

const projectDir = resolve(import.meta.dirname, '../../../..');

interface PreparedProject {
  readonly projectDir: string;
  readonly dryRun: boolean;
  readonly temporary: boolean;
}

story('Eject Story authoring', {
  description:
    'Follows project-wide preflight, dry-run selection, atomic source rewriting, and rollback protection.',
})
  .execute(({ projectDir, dryRun }: PreparedProject) =>
    ejectStories({ projectDir, dryRun }),
  )
  .scenario(
    'safe project-wide dry run',
    {
      description:
        'Plans ejection for Laymos itself and reports changes without writing source.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            projectDir,
            dryRun: true,
            temporary: false,
          }),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.dryRun, true);
            assert.ok(result.changed.length > 0);
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'apply a safe ejection plan',
    {
      description:
        'Rewrites recognized Story authoring after every candidate passes preflight.',
    },
    (scenario) =>
      scenario
        .prepare(() => temporaryProject('valid'))
        .verify((result, prepared) =>
          Effect.tryPromise({
            try: async () => {
              assert.equal(result.dryRun, false);
              assert.deepEqual(result.changed, ['src/value.ts']);
              const source = await readFile(
                join(prepared.projectDir, 'src/value.ts'),
                'utf8',
              );
              assert.ok(!source.includes('laymos/story'));
              assert.ok(source.includes('Effect.succeed(1)'));
            },
            catch: (cause) =>
              cause instanceof Error ? cause : new Error(String(cause)),
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'unsafe source fails preflight',
    {
      description:
        'Rejects the complete project before writing when Story authoring cannot be transformed safely.',
    },
    (scenario) =>
      scenario
        .prepare(() => temporaryProject('invalid'))
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(error._tag, 'StoryEjectionError');
          }),
        )
        .cleanup(cleanupProject),
  );

function temporaryProject(
  kind: 'valid' | 'invalid',
): Effect.Effect<PreparedProject, Error> {
  return Effect.tryPromise({
    try: async () => {
      const directory = await mkdtemp(join(tmpdir(), 'laymos-story-'));
      await mkdir(join(directory, 'src'));
      await writeFile(
        join(directory, 'laymos.config.ts'),
        `const app = { kind: 'layer', name: 'app', paths: ['src'], description: 'Application' };
export default {
  sourceRoots: ['src'],
  graphs: [{ kind: 'layer-graph', name: 'app', description: 'Application', layers: [app], edges: [] }],
};`,
      );
      await writeFile(
        join(directory, 'src/value.ts'),
        kind === 'valid'
          ? `import { Effect } from 'effect';
import { step } from 'laymos/story';
export const value = step(
  'Read value',
  { description: 'Returns the value.' },
  () => Effect.succeed(1),
);`
          : `import { step } from 'laymos/story';
step(`,
      );
      return {
        projectDir: directory,
        dryRun: false,
        temporary: true,
      };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });
}

function cleanupProject({
  projectDir,
  temporary,
}: PreparedProject): Effect.Effect<void, Error> {
  return temporary
    ? Effect.tryPromise({
        try: () => rm(projectDir, { recursive: true, force: true }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      })
    : Effect.void;
}
