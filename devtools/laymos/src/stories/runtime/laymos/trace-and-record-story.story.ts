import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';

import {
  runStories,
  type RunStoriesRequest,
} from '../../../entrypoints/node/index.js';
import { story } from '../../authoring/index.js';

interface PreparedProject {
  readonly request: RunStoriesRequest;
  readonly projectDir: string;
}

story('Trace and record a Story', {
  description:
    'Shows how one declaration becomes a complete structural trace and then concrete Scenario evidence, including expected behavior failures.',
})
  .execute(({ request }: PreparedProject) => runStories(request))
  .scenario(
    'trace is valid and one Scenario fails',
    {
      description:
        'Traces both decision arms, records successful and failed Scenario visits, and preserves the failure as report data.',
    },
    (scenario) =>
      scenario
        .prepare(temporaryStoryProject)
        .verify((result) =>
          Effect.sync(() => {
            assert.equal(result.status, 'failed');
            const run = Object.values(result.runs.stories)[0]!;
            assert.ok(
              Object.values(run.blocks).some(({ kind }) => kind === 'decision'),
            );
            assert.deepEqual(
              run.scenarios.map(({ outcome }) => outcome),
              ['succeeded', 'succeeded', 'failed'],
            );
            assert.equal(result.failures.length, 1);
          }),
        )
        .cleanup(({ projectDir }) =>
          Effect.tryPromise({
            try: () => rm(projectDir, { recursive: true, force: true }),
            catch: (cause) =>
              cause instanceof Error ? cause : new Error(String(cause)),
          }),
        ),
  );

function temporaryStoryProject(): Effect.Effect<PreparedProject, Error> {
  return Effect.tryPromise({
    try: async () => {
      const projectDir = await mkdtemp(join(tmpdir(), 'laymos-story-'));
      const surface = join(projectDir, 'src/checkout/laymos');
      await mkdir(surface, { recursive: true });
      await writeFile(
        join(projectDir, 'laymos.config.ts'),
        `const app = { kind: 'layer', name: 'app', paths: ['src'], description: 'Application' };
export default {
  sourceRoots: ['src'],
  graphs: [{ kind: 'layer-graph', name: 'app', description: 'Application', layers: [app], edges: [] }],
  modules: [{ kind: 'module', path: 'src/checkout', description: 'Checkout module' }],
};`,
      );
      await writeFile(
        join(surface, 'authorize.story.ts'),
        `import { Effect } from 'effect';
import { decision, exhaustive, story, terminal, when } from 'laymos/story';

const authorize = (approved: boolean) =>
  decision(
    'Payment approved',
    { description: 'Chooses the successful or declined authorization ending.' },
    approved,
  ).pipe(
    when(
      true,
      {
        name: 'Approved',
        description: 'Return the authorization.',
        completion: { kind: 'success' },
      },
      () =>
        terminal(
          'Authorization accepted',
          {
            description: 'Completes with the accepted authorization.',
            completion: { kind: 'success' },
          },
          () => Effect.succeed('authorized'),
        ),
    ),
    when(
      false,
      {
        name: 'Declined',
        description: 'Return a typed decline.',
        completion: { kind: 'error', error: 'PaymentDeclined' },
      },
      () =>
        terminal(
          'Authorization declined',
          {
            description: 'Completes with the typed payment decline.',
            completion: { kind: 'error', error: 'PaymentDeclined' },
          },
          () => Effect.fail('PaymentDeclined'),
        ),
    ),
    exhaustive,
  );

story('Authorize payment', {
  description: 'Explains both authorization outcomes.',
})
  .execute(authorize)
  .scenario(
    'approved',
    { description: 'Accepts an approved payment.' },
    (scenario) =>
      scenario
        .prepare(() => Effect.succeed(true))
        .verify((output) =>
          Effect.sync(() => {
            if (output !== 'authorized') throw new Error('unexpected output');
          }),
        ),
  )
  .scenario(
    'declined',
    { description: 'Returns the expected typed decline.' },
    (scenario) =>
      scenario
        .prepare(() => Effect.succeed(false))
        .verifyError((error) =>
          Effect.sync(() => {
            if (error !== 'PaymentDeclined') throw new Error('unexpected error');
          }),
        ),
  )
  .scenario(
    'wrong expectation',
    { description: 'Preserves an expectation mismatch as failed evidence.' },
    (scenario) =>
      scenario
        .prepare(() => Effect.succeed(false))
        .verify(() => Effect.void),
  );`,
      );
      return {
        projectDir,
        request: {
          projectDir,
          selectors: [
            {
              _tag: 'Story',
              storyPath: 'src/checkout/laymos/authorize',
            },
          ],
        },
      };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });
}
