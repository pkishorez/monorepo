import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';

import { Effect } from 'effect';

import {
  runStories,
  type RunStoriesRequest,
} from '../../../entrypoints/node/index.js';
import { story } from '../../authoring/index.js';

const projectDir = resolve(import.meta.dirname, '../../../..');
const moduleWithoutStories = 'src/index.ts';

story('Run selected Stories', {
  description:
    'Follows selector resolution, file validation, declaration loading, structural tracing, and Scenario recording.',
})
  .execute((request: RunStoriesRequest) => runStories(request))
  .scenario(
    'Module with no Stories',
    {
      description:
        'Treats a configured Module with no owned Stories as a valid empty selection.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            projectDir,
            selectors: [
              { _tag: 'Module' as const, modulePath: moduleWithoutStories },
            ],
          }),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.status, 'passed');
            assert.deepEqual(result.runs.stories, {});
          }),
        ),
  )
  .scenario(
    'exact Story selector',
    {
      description:
        'Gives an exact Story identity precedence and executes only that declaration.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            projectDir,
            selectors: [
              {
                _tag: 'Story' as const,
                storyPath:
                  'src/architecture/analyze-project/laymos/analyze-project',
              },
            ],
          }),
        )
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.status, 'passed');
            assert.deepEqual(Object.keys(result.runs.stories), [
              'src/architecture/analyze-project/laymos/analyze-project',
            ]);
          }),
        ),
  )
  .scenario(
    'unknown Module selector',
    {
      description:
        'Rejects an identity that is neither a configured Story nor a configured Module before execution.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            projectDir,
            selectors: [
              { _tag: 'Module' as const, modulePath: 'src/not-a-module' },
            ],
          }),
        )
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(
              (error as { readonly _tag?: string })._tag,
              'StoryRunnerError',
            );
          }),
        ),
  );
