import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Effect } from 'effect';

import { inspectStories } from '../../../entrypoints/node/index.js';
import { story } from '../../authoring/index.js';

const projectDir = resolve(import.meta.dirname, '../../../..');

interface PreparedProject {
  readonly projectDir: string;
  readonly temporary: boolean;
}

story("Inspect a project's Stories", {
  description:
    'Follows Module surface discovery, declaration validation, and structural tracing without executing real Scenario behavior.',
})
  .execute(({ projectDir }: PreparedProject) => inspectStories({ projectDir }))
  .scenario(
    'valid self-hosted Stories',
    {
      description:
        'Builds the owned catalog and confirms that every Laymos Story produces a complete structural trace.',
    },
    (scenario) =>
      scenario
        .prepare(() => Effect.succeed({ projectDir, temporary: false }))
        .verify((collection) =>
          Effect.sync(() => {
            assert.ok(Object.keys(collection.traces).length > 0);
            assert.ok(
              Object.values(collection.traces).every(
                (trace) => trace.status === 'valid',
              ),
            );
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'project has no configuration',
    {
      description:
        'Preserves configuration failure as a typed StoryDiscoveryError before surface discovery begins.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            projectDir: resolve(projectDir, 'missing-project'),
            temporary: false,
          }),
        )
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(error._tag, 'StoryDiscoveryError');
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'Laymos surface is structurally invalid',
    {
      description:
        'Rejects a nested surface and returns all discovery issues instead of a partial catalog.',
    },
    (scenario) =>
      scenario
        .prepare(() => temporaryStoryProject('nested-surface'))
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(error._tag, 'StoryDiscoveryError');
            assert.ok(error.issues.length > 0);
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'Story has no execution',
    {
      description:
        'Keeps the catalog but marks the Story trace invalid because no executable behavior was declared.',
    },
    (scenario) =>
      scenario
        .prepare(() => temporaryStoryProject('missing-execution'))
        .verify((collection) =>
          Effect.sync(() => {
            assert.equal(
              Object.values(collection.traces)[0]?.status,
              'invalid',
            );
          }),
        )
        .cleanup(cleanupProject),
  );

function temporaryStoryProject(
  kind: 'nested-surface' | 'missing-execution',
): Effect.Effect<PreparedProject, Error> {
  return Effect.tryPromise({
    try: async () => {
      const directory = await mkdtemp(join(tmpdir(), 'laymos-story-'));
      const surface = join(directory, 'src/app/laymos');
      await mkdir(surface, { recursive: true });
      await writeFile(
        join(directory, 'laymos.config.ts'),
        `const app = { kind: 'layer', name: 'app', paths: ['src'], description: 'Application' };
export default {
  sourceRoots: ['src'],
  graphs: [{ kind: 'layer-graph', name: 'app', description: 'Application', layers: [app], edges: [] }],
  modules: [{ kind: 'module', path: 'src/app', description: 'Application module' }],
};`,
      );
      if (kind === 'nested-surface') {
        await mkdir(join(surface, 'nested'));
      } else {
        await writeFile(
          join(surface, 'missing-execution.story.ts'),
          `import { story } from 'laymos/story';
story('Missing execution', { description: 'Declares metadata without executable behavior.' });`,
        );
      }
      return { projectDir: directory, temporary: true };
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
