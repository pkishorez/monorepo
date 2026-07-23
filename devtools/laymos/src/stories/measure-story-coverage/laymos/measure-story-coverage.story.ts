import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Effect } from 'effect';

import {
  measureStoryCoverage,
  type MeasureStoryCoverageRequest,
} from '../../../entrypoints/node/index.js';
import { story } from '../../authoring/index.js';

const projectDir = resolve(import.meta.dirname, '../../../..');

interface PreparedMeasurement {
  readonly request: MeasureStoryCoverageRequest;
  readonly temporary: boolean;
}

story('Measure Story narration coverage', {
  description:
    'Follows structural inspection, safe source projection, anchor classification, and explicit handling of invalid traces.',
})
  .execute(({ request }: PreparedMeasurement) => measureStoryCoverage(request))
  .scenario(
    'self-hosted Story coverage',
    {
      description:
        'Measures Laymos itself and returns classified evidence for every structurally valid Story.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            request: { projectDir },
            temporary: false,
          }),
        )
        .verify((report) =>
          Effect.sync(() => {
            assert.equal(report.invalidStories.length, 0);
            assert.ok(report.stories.length > 0);
          }),
        )
        .cleanup(cleanupMeasurement),
  )
  .scenario(
    'invalid trace is reported without a score',
    {
      description:
        'Keeps the invalid Story and its reason visible while excluding it from measured coverage.',
    },
    (scenario) =>
      scenario
        .prepare(temporaryInvalidMeasurement)
        .verify((report) =>
          Effect.sync(() => {
            assert.deepEqual(report.stories, []);
            assert.deepEqual(report.invalidStories, [
              {
                storyPath: 'src/app/laymos/invalid',
                message: 'Story has no execution',
              },
            ]);
          }),
        )
        .cleanup(cleanupMeasurement),
  );

function temporaryInvalidMeasurement(): Effect.Effect<
  PreparedMeasurement,
  Error
> {
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
      return {
        request: {
          projectDir: directory,
          stories: {
            catalog: { modules: [] },
            traces: {
              'src/app/laymos/invalid': {
                status: 'invalid',
                message: 'Story has no execution',
                blocks: {},
                execution: [],
              },
            },
          },
        },
        temporary: true,
      };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });
}

function cleanupMeasurement({
  request,
  temporary,
}: PreparedMeasurement): Effect.Effect<void, Error> {
  return temporary
    ? Effect.tryPromise({
        try: () => rm(request.projectDir, { recursive: true, force: true }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      })
    : Effect.void;
}
