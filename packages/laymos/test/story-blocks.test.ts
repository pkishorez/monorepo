import { createRequire } from 'node:module';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decision as effectDecision,
  functionBlock as effectFunctionBlock,
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
        selected,
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

  it('executes Effect Blocks', async () => {
    const add = effectFunctionBlock(
      'add',
      { description: 'Adds the two supplied numbers and returns their sum.' },
      (left: number, right: number) =>
        effectStep(
          'sum',
          {
            description:
              'Performs the arithmetic operation that produces the returned sum.',
          },
          Effect.succeed(left + right),
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
    const block = effectFunctionBlock(
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
      effectFunctionBlock(
        'empty block',
        { description: ' ' },
        () => Effect.void,
      ),
    ).toThrow('Block "empty block" description must not be empty');
    expect(() =>
      effectStep('empty step', { description: '' }, Effect.void),
    ).toThrow('Block "empty step" description must not be empty');
    expect(() =>
      effectDecision('empty decision', { description: '\n' }, true),
    ).toThrow('Decision "empty decision" description must not be empty');
    expect(() =>
      effectDecision(
        'valid decision',
        { description: 'Explains the choice.' },
        true,
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
