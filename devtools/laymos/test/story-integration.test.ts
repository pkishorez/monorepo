import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { Cause, Effect, Exit } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import {
  discoverStories,
  getStories,
  runAllStories,
  runStory,
  runStoryGroup,
} from '../src/node.js';

const temporaryDirectories: string[] = [];
const integrationFixtureRoot = join(
  import.meta.dirname,
  'fixtures',
  'story-integration',
);

afterEach(async () => {
  delete (
    globalThis as typeof globalThis & { __laymosCleanupStarted?: unknown }
  ).__laymosCleanupStarted;
  delete (
    globalThis as typeof globalThis & { __laymosDiscoveryLoaded?: unknown }
  ).__laymosDiscoveryLoaded;
  delete (
    globalThis as typeof globalThis & { __laymosDiscoveryLoads?: unknown }
  ).__laymosDiscoveryLoads;
  delete (globalThis as typeof globalThis & { __laymosStoryExecuted?: unknown })
    .__laymosStoryExecuted;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeBaseDir(): Promise<string> {
  const baseDir = await mkdtemp(join(import.meta.dirname, 'tmp-story-'));
  temporaryDirectories.push(baseDir);
  return baseDir;
}

describe('Story integration', () => {
  it('generates a structural Story Trace without running Step bodies or Scenarios', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'checkout.story.ts';
    await writeFile(join(baseDir, storyId), checkoutStorySource());

    const collection = await Effect.runPromise(getStories(baseDir));
    const trace = collection.traces[storyId];

    expect(trace?.status).toBe('valid');
    if (trace?.status !== 'valid') return;
    expect(JSON.stringify(trace.execution)).toContain('decision');
    expect(Object.values(trace.blocks).map(({ name }) => name)).toContain(
      'charge card',
    );
    expect(Object.values(trace.blocks).map(({ kind }) => kind)).toContain(
      'flow',
    );
    expect(
      Object.values(trace.blocks).some(
        ({ location }) =>
          location.endLine !== undefined && location.endLine > location.line,
      ),
    ).toBe(true);
    expect(collection.catalog.stories).toHaveLength(1);
  });

  it('captures each piped Decision Arm at its authored location', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'arm-locations.story.ts';
    await copyFile(
      join(integrationFixtureRoot, storyId),
      join(baseDir, storyId),
    );

    const collection = await Effect.runPromise(getStories(baseDir));
    const trace = collection.traces[storyId];
    expect(trace?.status).toBe('valid');
    if (trace?.status !== 'valid') return;
    const decision = Object.values(trace.blocks).find(
      (block) => block.kind === 'decision',
    );
    expect(decision?.kind).toBe('decision');
    if (decision?.kind !== 'decision') return;
    const actual = decision.arms.map(({ location }) =>
      location ? `${location.file}:${location.line}` : null,
    );
    const expected = JSON.parse(
      await readFile(
        join(integrationFixtureRoot, 'arm-locations.expected.json'),
        'utf8',
      ),
    );
    expect(actual).toEqual(expected);
  });

  it('loads each Story module once while building traces', async () => {
    const baseDir = await makeBaseDir();
    await writeFile(
      join(baseDir, 'single-load.story.ts'),
      `
import { Effect } from 'effect';
import { story } from 'laymos/story';
globalThis.__laymosDiscoveryLoads = (globalThis.__laymosDiscoveryLoads ?? 0) + 1;
story('Single load', { description: 'Loads once during discovery' })
  .execute(() => Effect.void);
`,
    );

    await Effect.runPromise(getStories(baseDir));

    expect(
      (globalThis as typeof globalThis & { __laymosDiscoveryLoads?: number })
        .__laymosDiscoveryLoads,
    ).toBe(1);
  });

  it('returns Effect Scenarios and timing without writing generated state', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'checkout.story.ts';
    await writeFile(join(baseDir, storyId), checkoutStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));
    const artifact = result.run;

    expect(result.status).toBe('passed');
    expect(artifact.scenarios).toHaveLength(2);
    expect(artifact.scenarios.map((scenario) => scenario.outcome)).toEqual([
      'succeeded',
      'succeeded',
    ]);
    for (const scenario of artifact.scenarios) {
      expect(scenario.location.file).toBe(storyId);
      expect(scenario.startedAt).toBeTypeOf('number');
      expect(scenario.durationMillis).toBeTypeOf('number');
      const visit = scenario.execution[0];
      expect(visit).toMatchObject({ outcome: 'succeeded' });
      if (visit !== undefined && 'blockId' in visit) {
        expect(visit.startOffsetMillis).toBeTypeOf('number');
        expect(visit.durationMillis).toBeTypeOf('number');
      }
    }
    const decision = Object.values(artifact.blocks).find(
      (block) => block.kind === 'decision' && block.arms.length === 2,
    );
    expect(decision).toBeDefined();
    if (decision?.kind === 'decision') {
      for (const arm of decision.arms) {
        expect(arm.location).toMatchObject({ file: storyId });
        expect(arm.location?.endLine).toBeGreaterThanOrEqual(
          arm.location?.line ?? 0,
        );
      }
    }
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('records Blocks imported transitively from production modules', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'transitive.story.ts';
    await writeFile(join(baseDir, 'workflow.ts'), transitiveWorkflowSource());
    await writeFile(join(baseDir, storyId), transitiveStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(result.status).toBe('passed');
    expect(blockNames(result.run)).toEqual(['transitive execution']);
  });

  it('traces local Terminals and validates completed Scenario evidence', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'terminals.story.ts';
    await writeFile(join(baseDir, storyId), terminalStorySource());

    const collection = await Effect.runPromise(getStories(baseDir));
    const trace = collection.traces[storyId];
    expect(trace?.status).toBe('valid');
    if (trace?.status !== 'valid') return;
    expect(Object.values(trace.blocks)).toContainEqual(
      expect.objectContaining({
        kind: 'terminal',
        name: 'trace terminal',
      }),
    );
    expect(JSON.stringify(trace.execution)).toContain('terminal');

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(result.run.scenarios.map(({ outcome }) => outcome)).toEqual([
      'succeeded',
      'failed',
      'succeeded',
      'failed',
      'succeeded',
    ]);
    expect(result.run.scenarios[1]?.failures).toEqual([
      {
        phase: 'execution',
        message:
          'Terminal "finish root branch" was followed by Block "after decision" in the same sequential branch',
      },
    ]);
    expect(JSON.stringify(result.run.scenarios[1]?.execution)).toContain(
      '"terminalMismatch":true',
    );
    expect(result.run.scenarios[3]?.failures).toEqual([
      {
        phase: 'execution',
        message:
          'Terminal "mislabel failure" declares success completion but its Visit was failed',
      },
    ]);
    expect(JSON.stringify(result.run.scenarios[3]?.execution)).toContain(
      '"terminalMismatch":true',
    );
    expect(result.run.scenarios[4]?.failures).toEqual([]);
    expect(result.run.scenarioNodeCoverage).toMatchObject({
      visited: expect.any(Number),
      total: expect.any(Number),
      percentage: expect.any(Number),
    });
    expect(result.run.scenarioNodeCoverage?.visited).toBeLessThan(
      result.run.scenarioNodeCoverage?.total ?? 0,
    );
  });

  it('validates Decision Arm completion against Scenario evidence', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'arm-completion.story.ts';
    await writeFile(join(baseDir, storyId), armCompletionStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(result.run.scenarios.map(({ outcome }) => outcome)).toEqual([
      'succeeded',
      'failed',
    ]);
    expect(result.run.scenarios[1]?.failures).toEqual([
      {
        phase: 'execution',
        message:
          'Arm "Mislabeled path" on Decision "Complete route" declares success completion but its Visit was failed',
      },
    ]);
    expect(JSON.stringify(result.run.scenarios[1]?.execution)).toContain(
      '"terminalMismatch":true',
    );
  });

  it('runs Effect Scenarios and interrupts on timeout', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'access.story.ts';
    await writeFile(join(baseDir, storyId), effectStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(result.status).toBe('failed');
    expect(result.run.scenarios.map((scenario) => scenario.outcome)).toEqual([
      'succeeded',
      'interrupted',
      'skipped',
    ]);
    const interrupted = result.run.scenarios[1];
    expect(interrupted?.durationMillis).toBeLessThan(5_000);
    expect(interrupted?.failures).toEqual([
      {
        phase: 'execution',
        message: 'Scenario timed out after 30ms',
      },
    ]);
  });

  it('attempts cleanup without allowing it to outlive the Scenario timeout', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'cleanup-timeout.story.ts';
    await writeFile(join(baseDir, storyId), cleanupTimeoutStorySource());
    const cleanupState = globalThis as typeof globalThis & {
      __laymosCleanupStarted?: boolean | (() => void);
    };
    cleanupState.__laymosCleanupStarted = false;

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(cleanupState.__laymosCleanupStarted).toBe(true);
    expect(result.run.scenarios[0]).toMatchObject({
      outcome: 'interrupted',
      failures: [
        {
          phase: 'cleanup',
          message: 'Scenario timed out after 30ms',
        },
      ],
    });
    expect(result.run.scenarios[0]?.durationMillis).toBeLessThan(5_000);
  });

  it('lets Effect interruption cancel cleanup', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'cleanup-interruption.story.ts';
    await writeFile(
      join(baseDir, storyId),
      cleanupTimeoutStorySource('5 seconds'),
    );
    const cleanupStarted = new Promise<void>((resolve) => {
      (
        globalThis as typeof globalThis & {
          __laymosCleanupStarted?: () => void;
        }
      ).__laymosCleanupStarted = resolve;
    });
    const abort = new AbortController();
    const running = Effect.runPromiseExit(runStory(baseDir, storyId), {
      signal: abort.signal,
    });

    await cleanupStarted;
    abort.abort();
    const exit = await running;

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
  });

  it('records only shared execution and preserves lifecycle failures by phase', async () => {
    const baseDir = await makeBaseDir();
    const storyId = 'lifecycle.story.ts';
    await writeFile(join(baseDir, storyId), lifecycleStorySource());

    const result = await Effect.runPromise(runStory(baseDir, storyId));

    expect(result.status).toBe('failed');
    expect(result.run.scenarios.map(({ outcome }) => outcome)).toEqual([
      'succeeded',
      'failed',
    ]);
    expect(result.run.scenarios[0]?.failures).toEqual([]);
    expect(result.run.scenarios[1]?.failures).toEqual([
      { phase: 'cleanup', message: 'cleanup failed' },
    ]);
    expect(blockNames(result.run)).toEqual(['shared execution']);
  });

  it('declares nothing and runs nothing outside a generation', async () => {
    const { story } = await import('../src/story/effect/index.js');
    let ran = false;

    story('outside runner', { description: 'Declared outside the runner' })
      .execute(() =>
        Effect.sync(() => {
          ran = true;
        }),
      )
      .scenario(
        'never runs',
        { description: 'Body must not execute' },
        (scenario) =>
          scenario.prepare(() => Effect.void).verify(() => Effect.void),
      );

    expect(ran).toBe(false);
    expect(existsSync(join(import.meta.dirname, '.laymos'))).toBe(false);
  });

  it('treats a complete generation with no Stories as passed and empty', async () => {
    const baseDir = await makeBaseDir();

    const result = await Effect.runPromise(runAllStories(baseDir));

    expect(result).toEqual({
      status: 'passed',
      runs: { stories: {} },
      failures: [],
    });
    expect(existsSync(join(baseDir, '.laymos'))).toBe(false);
  });

  it('discovers a described Story catalog without executing Stories', async () => {
    const baseDir = await makeBaseDir();
    await writeFile(
      join(baseDir, 'side-effect.story.ts'),
      `
import { Effect } from 'effect';
import { storyGroup } from 'laymos/story';
globalThis.__laymosDiscoveryLoaded = true;
storyGroup('Commerce', { description: 'Purchase behavior' })
  .group('Checkout', { description: 'Checkout behavior' })
  .story('Pay', { description: 'Pays for a checkout' })
  .execute(() => Effect.sync(() => { globalThis.__laymosStoryExecuted = true; }));
`,
    );

    await expect(Effect.runPromise(discoverStories(baseDir))).resolves.toEqual({
      groups: [
        {
          path: ['Commerce'],
          name: 'Commerce',
          description: 'Purchase behavior',
        },
        {
          path: ['Commerce', 'Checkout'],
          name: 'Checkout',
          description: 'Checkout behavior',
        },
      ],
      stories: [
        {
          storyId: 'side-effect.story.ts',
          name: 'Pay',
          description: 'Pays for a checkout',
          groupPath: ['Commerce', 'Checkout'],
        },
      ],
    });
    expect(
      (globalThis as typeof globalThis & { __laymosDiscoveryLoaded?: boolean })
        .__laymosDiscoveryLoaded,
    ).toBe(true);
    expect(
      (globalThis as typeof globalThis & { __laymosStoryExecuted?: boolean })
        .__laymosStoryExecuted,
    ).toBeUndefined();

    await writeFile(join(baseDir, 'InvalidName.story.ts'), '');
    await expect(Effect.runPromise(discoverStories(baseDir))).rejects.toThrow(
      'kebab-case',
    );
  });

  it('aggregates catalog conflicts across Story files', async () => {
    const baseDir = await makeBaseDir();
    await writeFile(
      join(baseDir, 'first.story.ts'),
      groupedStorySource('First description'),
    );
    await writeFile(
      join(baseDir, 'second.story.ts'),
      groupedStorySource('Conflicting description'),
    );

    const exit = await Effect.runPromiseExit(discoverStories(baseDir));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const message = Cause.pretty(exit.cause);
      expect(message).toContain('conflicts with metadata');
      expect(message).toContain('conflicts with Story');
    }
  });

  it('runs every descendant Story in a Group and excludes Standalone Stories', async () => {
    const baseDir = await makeBaseDir();
    await writeFile(
      join(baseDir, 'first.story.ts'),
      groupedStorySource('Shared description', 'First'),
    );
    await writeFile(
      join(baseDir, 'second.story.ts'),
      groupedStorySource('Shared description', 'Second', true),
    );
    await writeFile(
      join(baseDir, 'standalone.story.ts'),
      standaloneStorySource(),
    );

    const result = await Effect.runPromise(runStoryGroup(baseDir, ['Shared']));

    expect(Object.keys(result.runs.stories)).toEqual([
      'first.story.ts',
      'second.story.ts',
    ]);
  });

  it('does not discover Stories in skipped directories', async () => {
    const baseDir = await makeBaseDir();
    for (const directory of ['node_modules', 'dist', '.hidden']) {
      await mkdir(join(baseDir, directory));
      await writeFile(join(baseDir, directory, 'ignored.story.ts'), '');
    }
    await writeFile(
      join(baseDir, 'included.story.ts'),
      standaloneStorySource(),
    );

    await expect(Effect.runPromise(discoverStories(baseDir))).resolves.toEqual({
      groups: [],
      stories: [
        {
          storyId: 'included.story.ts',
          name: 'Standalone',
          description: 'A standalone Story',
          groupPath: [],
        },
      ],
    });
  });
});

function groupedStorySource(
  groupDescription: string,
  storyName = 'Duplicate',
  nested = false,
): string {
  const target = nested
    ? `.group('Nested', { description: 'Nested behavior' })`
    : '';
  return `
import { Effect } from 'effect';
import { storyGroup } from 'laymos/story';
storyGroup('Shared', { description: '${groupDescription}' })
  ${target}
  .story('${storyName}', { description: 'Grouped behavior' })
  .execute(() => Effect.void);
`;
}

function standaloneStorySource(): string {
  return `
import { Effect } from 'effect';
import { story } from 'laymos/story';
story('Standalone', { description: 'A standalone Story' })
  .execute(() => Effect.void);
`;
}

function checkoutStorySource(): string {
  return `
import { Effect } from 'effect';
import { decision, exhaustive, flow, step, story, when } from 'laymos/story';
import { strict as assert } from 'node:assert';

const checkout = flow(
  'checkout',
  { description: 'Routes a prepared checkout to its payment or rejection outcome.', attributes: (outcome) => ({ outcome }) },
  (outcome) =>
    decision('fraud gate', { description: 'Chooses whether the fraud outcome permits payment.' }, outcome).pipe(
      when('approved', { description: 'Allows payment because fraud checks approved the order.' }, () => step('charge card', { description: 'Charges the approved order to complete payment.' }, () => Effect.succeed('paid'))),
      when('rejected', { description: 'Stops payment because fraud checks rejected the order.' }, () => step('reject order', { description: 'Records the rejected checkout without charging the customer.' }, () => Effect.succeed('stopped'))),
      exhaustive,
    ),
);

story('checkout', { description: 'Routes checkout by fraud outcome' })
  .execute((outcome: 'approved' | 'rejected') => checkout(outcome))
  .scenario('approved', { description: 'Charges an approved order' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('approved' as const)).verify((result) => Effect.sync(() => assert.equal(result, 'paid'))),
  )
  .scenario('rejected', { description: 'Stops a rejected order' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('rejected' as const)).verify((result) => Effect.sync(() => assert.equal(result, 'stopped'))),
  );
`;
}

function terminalStorySource(): string {
  return `
import { strict as assert } from 'node:assert';
import { Effect } from 'effect';
import { all, flow, step, story, terminal } from 'laymos/story';

const nested = flow(
  'nested lookup',
  { description: 'Contains a local successful Terminal.' },
  () => terminal(
    'finish nested flow',
    {
      description: 'Ends only the nested lookup branch.',
      completion: { kind: 'success' },
    },
    () => Effect.succeed('nested' as const),
  ),
);

const execute = (mode: 'nested' | 'root-mismatch' | 'error' | 'completion-mismatch' | 'parallel') => {
  if (mode === 'nested') {
    return nested().pipe(
      Effect.andThen(step('after decision', { description: 'Continues after the nested Flow.' }, () => Effect.void)),
      Effect.as('nested' as const),
    );
  }
  if (mode === 'root-mismatch') {
    return terminal(
      'finish root branch',
      { description: 'Claims this root branch ends.', completion: { kind: 'success' } },
      () => Effect.succeed('root-mismatch' as const),
    ).pipe(
      Effect.andThen(step('after decision', { description: 'Incorrectly continues the root branch.' }, () => Effect.void)),
      Effect.as('root-mismatch' as const),
    );
  }
  if (mode === 'error') {
    return terminal(
      'reject request',
      {
        description: 'Rejects the request at this root branch.',
        completion: { kind: 'error', error: 'RequestRejected' },
      },
      () => Effect.fail(new Error('rejected')),
    );
  }
  if (mode === 'completion-mismatch') {
    return terminal(
      'mislabel failure',
      { description: 'Incorrectly documents a successful ending.', completion: { kind: 'success' } },
      () => Effect.fail(new Error('mislabeled')),
    );
  }
  if (mode === 'parallel') {
    return all([
      terminal(
        'finish parallel branch',
        { description: 'Ends one parallel branch.', completion: { kind: 'success' } },
        () => Effect.succeed('terminal'),
      ),
      step(
        'parallel sibling',
        { description: 'Runs independently beside the Terminal branch.' },
        () => Effect.succeed('sibling'),
      ),
    ]).pipe(
      Effect.andThen(step('after decision', { description: 'Continues after parallel branches.' }, () => Effect.void)),
      Effect.as('parallel' as const),
    );
  }
  return terminal(
    'trace terminal',
    { description: 'Makes the structural trace expose Terminal narration.', completion: { kind: 'success' } },
    () => Effect.succeed('trace' as const),
  );
};

story('Terminal routes', { description: 'Exercises local Terminal documentation.' })
  .execute(execute)
  .scenario('nested Flow', { description: 'Allows the nested Flow caller to continue.' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('nested' as const)).verify((value) => Effect.sync(() => assert.equal(value, 'nested'))),
  )
  .scenario('root continuation mismatch', { description: 'Detects continuation after a root Terminal.' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('root-mismatch' as const)).verify((value) => Effect.sync(() => assert.equal(value, 'root-mismatch'))),
  )
  .scenario('matching error', { description: 'Accepts the documented error completion.' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('error' as const)).verifyError((error) => Effect.sync(() => assert.equal(error.message, 'rejected'))),
  )
  .scenario('completion mismatch', { description: 'Detects a failed Visit declared successful.' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('completion-mismatch' as const)).verifyError((error) => Effect.sync(() => assert.equal(error.message, 'mislabeled'))),
  )
  .scenario('parallel sibling', { description: 'Allows siblings and the outer branch to continue.' }, (scenario) =>
    scenario.prepare(() => Effect.succeed('parallel' as const)).verify((value) => Effect.sync(() => assert.equal(value, 'parallel'))),
  );
`;
}

function armCompletionStorySource(): string {
  return `
import { strict as assert } from 'node:assert';
import { Effect } from 'effect';
import { decision, exhaustive, story, when } from 'laymos/story';

const execute = (mode: 'success' | 'mismatch') =>
  decision(
    'Complete route',
    { description: 'Completes through the selected Arm.' },
    mode,
  ).pipe(
    when(
      'success',
      {
        name: 'Successful path',
        description: 'Completes successfully.',
        completion: { kind: 'success' },
      },
      () => Effect.succeed('done' as const),
    ),
    when(
      'mismatch',
      {
        name: 'Mislabeled path',
        description: 'Incorrectly claims successful completion.',
        completion: { kind: 'success' },
      },
      () => Effect.fail(new Error('failed')),
    ),
    exhaustive,
  );

story('Arm completion', { description: 'Validates Arm completion evidence.' })
  .execute(execute)
  .scenario('matching completion', { description: 'Matches successful completion.' }, (scenario) =>
    scenario
      .prepare(() => Effect.succeed('success' as const))
      .verify((value) => Effect.sync(() => assert.equal(value, 'done'))),
  )
  .scenario('mismatched completion', { description: 'Finds a mislabeled failed Arm.' }, (scenario) =>
    scenario
      .prepare(() => Effect.succeed('mismatch' as const))
      .verifyError((error) => Effect.sync(() => assert.equal(error.message, 'failed'))),
  );
`;
}

function effectStorySource(): string {
  return `
import { Context, Effect, Layer } from 'effect';
import { step, story } from 'laymos/story';

const SharedValue = Context.Reference<number>('story/shared-value', {
  defaultValue: () => 0,
});

story('access', { description: 'Grants and audits access' })
  .provide(Layer.succeed(SharedValue, 42))
  .execute((hang: boolean) => Effect.gen(function* () {
    yield* SharedValue;
    if (hang) return yield* step('call dead service', { description: 'Waits for an unavailable dependency to demonstrate execution interruption.' }, () => Effect.sleep('5 seconds'));
    return yield* step('issue session', { description: 'Completes the successful access path by issuing an authenticated session.' }, () => Effect.void);
  }))
  .scenario('grants access', { description: 'Issues a session' }, (scenario) =>
    scenario
      .prepare(() => Effect.gen(function* () {
        yield* SharedValue;
        return false;
      }))
      .verify(() => Effect.gen(function* () {
        yield* SharedValue;
      })),
  )
  .scenario(
    'hangs on a dead dependency',
    { description: 'Times out against an unresponsive integration', timeout: '30 millis' },
    (scenario) => scenario.prepare(() => Effect.succeed(true)).verify(() => Effect.void),
  )
  .skip('future outage path', {
    description: 'Documents a planned Scenario',
  });
`;
}

function lifecycleStorySource(): string {
  return `
import { strict as assert } from 'node:assert';
import { Effect } from 'effect';
import { step, story } from 'laymos/story';

story('lifecycle', { description: 'Separates operational phases from narrative' })
  .execute((prepared: 'expected-error' | 'cleanup-error') =>
    step('shared execution', { description: 'Produces the execution result selected by the prepared lifecycle condition.' }, () => prepared === 'expected-error' ? Effect.fail(new Error('expected')) : Effect.succeed('done')),
  )
  .scenario('expected error', { description: 'Accepts an intentional execution error' }, (scenario) =>
    scenario
      .prepare(() => step('unrecorded preparation', { description: 'Prepares the expected-error condition outside narrated execution.' }, () => Effect.succeed('expected-error' as const)))
      .verifyError((error) => step('unrecorded verification', { description: 'Verifies the intentional execution error outside narrated execution.' }, () => Effect.sync(() => assert.equal(error.message, 'expected'))))
      .cleanup(() => step('unrecorded cleanup', { description: 'Releases lifecycle resources outside narrated execution.' }, () => Effect.void)),
  )
  .scenario('cleanup failure', { description: 'Preserves a cleanup failure separately' }, (scenario) =>
    scenario
      .prepare(() => Effect.succeed('cleanup-error' as const))
      .verify((result) => Effect.sync(() => assert.equal(result, 'done')))
      .cleanup(() => Effect.fail(new Error('cleanup failed'))),
  );
`;
}

function cleanupTimeoutStorySource(timeout = '30 millis'): string {
  return `
import { Effect } from 'effect';
import { story } from 'laymos/story';

story('cleanup timeout', { description: 'Bounds cleanup within the Scenario deadline' })
  .execute(() => Effect.void)
  .scenario(
    'hanging cleanup',
    { description: 'Attempts cleanup without waiting forever', timeout: '${timeout}' },
    (scenario) => scenario
      .prepare(() => Effect.void)
      .verify(() => Effect.void)
      .cleanup(() => Effect.sync(() => {
        if (typeof globalThis.__laymosCleanupStarted === 'function') {
          globalThis.__laymosCleanupStarted();
        } else {
          globalThis.__laymosCleanupStarted = true;
        }
      }).pipe(Effect.andThen(Effect.never))),
  );
`;
}

function transitiveWorkflowSource(): string {
  return `
import { Effect } from 'effect';
import { flow } from 'laymos/story';

export const executeWorkflow = flow(
  'transitive execution',
  { description: 'Runs a Block declared in a production workflow module.' },
  () => Effect.succeed('done'),
);
`;
}

function transitiveStorySource(): string {
  return `
import { strict as assert } from 'node:assert';
import { Effect } from 'effect';
import { story } from 'laymos/story';
import { executeWorkflow } from './workflow.js';

story('transitive', { description: 'Exercises a production workflow import' })
  .execute(() => executeWorkflow())
  .scenario('runs', { description: 'Records the imported workflow Block' }, (scenario) =>
    scenario
      .prepare(() => Effect.void)
      .verify((result) => Effect.sync(() => assert.equal(result, 'done'))),
  );
`;
}

function blockNames(artifact: {
  readonly blocks: Readonly<Record<string, { readonly name: string }>>;
}): string[] {
  return Object.values(artifact.blocks)
    .map(({ name }) => name)
    .sort();
}
