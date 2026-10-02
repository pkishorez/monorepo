import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { Story, type ProofReporter } from '../index.js';

function recorder() {
  const sections: unknown[] = [];
  const assertions: { description: string; passed: boolean }[] = [];
  const reporter: ProofReporter = {
    beginSection: (section) => sections.push(section),
    assert: (description, passed) => assertions.push({ description, passed }),
  };
  return { sections, assertions, reporter };
}

describe('StoryQuestion.run', () => {
  test('returns the proof value and reports its assertions', async () => {
    const { assertions, reporter } = recorder();
    const question = Story.question('What is the answer?', {
      answer: 'It is 42.',
      proof: Effect.gen(function* () {
        yield* Story.assert('the answer is 42', true);
        return 42;
      }),
    });

    const outcome = await question.run(reporter, new AbortController().signal);

    expect(outcome).toEqual({ _tag: 'Success', value: 42 });
    expect(assertions).toEqual([
      { description: 'the answer is 42', passed: true },
    ]);
  });

  test('turns a failing proof into a readable error', async () => {
    const { reporter } = recorder();
    const question = Story.question('Does it fail?', {
      answer: 'Yes.',
      proof: Effect.fail(new Error('boom')),
    });

    const outcome = await question.run(reporter, new AbortController().signal);

    expect(outcome._tag).toBe('Failure');
    expect(outcome._tag === 'Failure' && outcome.error).toContain('boom');
  });

  test('aborting the signal interrupts the proof and runs its finalizers', async () => {
    const { reporter } = recorder();
    let finalized = false;
    const question = Story.question('Does it stop?', {
      answer: 'Yes.',
      proof: Effect.never.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            finalized = true;
          }),
        ),
      ),
    });
    const controller = new AbortController();

    const running = question.run(reporter, controller.signal);
    controller.abort();

    await expect(running).rejects.toBeDefined();
    expect(finalized).toBe(true);
  });
});
