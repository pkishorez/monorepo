import { createRequire } from 'node:module';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decision as effectDecision,
  flow as effectFlow,
  step as effectStep,
  story as effectStory,
} from '../src/story/effect/index.js';
import { CurrentRecorder } from '../src/story/core/recorder.js';
import type { StoryRecorder } from '../src/story/core/recorder.js';

describe('Story Blocks', () => {
  it('runs yieldable Effect Decision builders', async () => {
    const program = Effect.gen(function* () {
      const selected = 'rejected' as 'approved' | 'rejected';
      return yield* effectDecision(
        'fraud gate',
        {
          description:
            'Routes checkout to payment or rejection according to the fraud result.',
        },
        () => Effect.succeed(selected),
      )
        .when(
          'approved',
          {
            description:
              'Continues to payment because the fraud result approved the order.',
          },
          () => Effect.succeed('paid' as const),
        )
        .when(
          'rejected',
          {
            description:
              'Stops checkout because the fraud result rejected the order.',
          },
          () => Effect.succeed('stopped' as const),
        )
        .exhaustive();
    });

    await expect(Effect.runPromise(program)).resolves.toBe('stopped');
  });

  it('uses strict Decision equality and defects on impossible exhaustive values', async () => {
    const signedZero = effectDecision(
      'signed zero',
      { description: 'Treats signed zero as the same narrative choice.' },
      -0 as 0,
    )
      .when(0, { description: 'Handles zero regardless of its sign.' }, () =>
        Effect.succeed('zero'),
      )
      .exhaustive();
    await expect(Effect.runPromise(signedZero)).resolves.toBe('zero');

    const impossible = effectDecision(
      'unsafe input',
      { description: 'Rejects values outside the declared choices.' },
      'missing' as 'handled',
    )
      .when(
        'handled',
        { description: 'Handles the only declared value.' },
        () => Effect.void,
      )
      .exhaustive();
    await expect(Effect.runPromise(impossible)).rejects.toThrow(
      'Unexpected decision value: missing',
    );
  });

  it('rejects non-finite numeric Decision Arms', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        effectDecision(
          'numeric choice',
          { description: 'Uses stable numeric narrative choices.' },
          value,
        ).when(
          value,
          { description: 'Would handle the numeric value.' },
          () => Effect.void,
        ),
      ).toThrow('Decision Arm numeric values must be finite');
    }
  });

  it('executes Effect Blocks', async () => {
    const add = effectFlow(
      'add',
      { description: 'Adds the two supplied numbers and returns their sum.' },
      (left: number, right: number) =>
        effectStep(
          'sum',
          {
            description:
              'Performs the arithmetic operation that produces the returned sum.',
          },
          () => Effect.succeed(left + right),
        ),
    );

    await expect(Effect.runPromise(add(2, 3))).resolves.toBe(5);
  });

  it('keeps production Blocks inert when a recorder service is present', async () => {
    let recorderCalls = 0;
    let attributeCalls = 0;
    const recorder: StoryRecorder = {
      declareArm: () => {
        recorderCalls += 1;
      },
      start: () => {
        recorderCalls += 1;
        return undefined;
      },
      finish: () => {
        recorderCalls += 1;
      },
    };
    const body = (value: number) => Effect.succeed(value + 1);
    const block = effectFlow(
      'increment',
      {
        description: 'Adds one to the supplied number.',
        attributes: (value) => {
          attributeCalls += 1;
          return { value };
        },
      },
      body,
    );

    expect(block).toBe(body);
    await expect(
      Effect.runPromise(
        block(1).pipe(Effect.provideService(CurrentRecorder, recorder)),
      ),
    ).resolves.toBe(2);
    expect(recorderCalls).toBe(0);
    expect(attributeCalls).toBe(0);
  });

  it('does not expose the private Story runtime as a package subpath', () => {
    const resolvePackage = createRequire(import.meta.url).resolve;

    expect(() => resolvePackage('laymos/story/story-runtime')).toThrow(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    );
  });

  it('rejects empty narrative descriptions at runtime', () => {
    expect(() =>
      effectFlow('empty block', { description: ' ' }, () => Effect.void),
    ).toThrow('Flow "empty block" description must not be empty');
    expect(() =>
      effectStep('empty step', { description: '' }, () => Effect.void),
    ).toThrow('Step "empty step" description must not be empty');
    expect(() =>
      effectDecision('empty decision', { description: '\n' }, () =>
        Effect.succeed(true),
      ),
    ).toThrow('Decision "empty decision" description must not be empty');
    expect(() =>
      effectDecision(
        'valid decision',
        { description: 'Explains the choice.' },
        () => Effect.succeed(true),
      ).when(true, { description: '\t' }, () => Effect.void),
    ).toThrow('Decision Arm "true" description must not be empty');
    expect(() => effectStory('empty story', { description: ' ' })).toThrow(
      'Story "empty story" description must not be empty',
    );

    const declared = effectStory('valid story', {
      description: 'Explains the shared execution.',
    }).execute((prepared: void) => Effect.succeed(prepared));
    expect(() =>
      declared.scenario('empty scenario', { description: '' }, (scenario) =>
        scenario.prepare(() => Effect.void).verify(() => Effect.void),
      ),
    ).toThrow('Scenario "empty scenario" description must not be empty');
  });
});
