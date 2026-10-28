import { Effect, Fiber, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import type { RawOut } from '../../../../contract/index.js';
import { makeQuestions } from '../questions.js';

/*
 * The Agent Questions Claude Code waits on: what the user answered or
 * declined is recorded as given, by Item id; one aborted is not.
 */

const input = {
  questions: [
    {
      question: 'Which fruits?',
      header: 'Fruits',
      options: [
        { label: 'Apples, red', description: '' },
        { label: 'Pears', description: '' },
      ],
      multiSelect: true,
    },
  ],
};

/** Asks one question, waits until it is listed, then runs `then`. */
const asking = <A>(
  signal: AbortSignal,
  then: (
    questions: Effect.Success<ReturnType<typeof makeQuestions>>,
  ) => Effect.Effect<A, unknown>,
) =>
  Effect.gen(function* () {
    const recorded: Array<RawOut> = [];
    const questions = yield* makeQuestions((out) =>
      Effect.sync(() => void recorded.push(out)),
    );
    const asked = yield* Effect.forkChild(
      questions.ask('toolu_1', input, signal),
    );
    yield* questions.changes.pipe(
      Stream.filter((list) => list.length > 0),
      Stream.runHead,
    );
    yield* then(questions);
    return { result: yield* Fiber.join(asked), recorded };
  });

describe('Claude Code Agent Questions', () => {
  it('record the answer as given, each choice whole', async () => {
    const { result, recorded } = await Effect.runPromise(
      asking(new AbortController().signal, (questions) =>
        questions.answer('toolu_1', { '0': ['Apples, red', 'Pears'] }),
      ),
    );
    expect(recorded).toEqual([
      {
        kind: 'question.answered',
        payload: {
          toolUseId: 'toolu_1',
          answers: { '0': ['Apples, red', 'Pears'] },
        },
      },
    ]);
    expect(result).toMatchObject({
      behavior: 'allow',
      updatedInput: { answers: { 'Which fruits?': 'Apples, red, Pears' } },
    });
  });

  it('record a decline as null answers', async () => {
    const { result, recorded } = await Effect.runPromise(
      asking(new AbortController().signal, (questions) =>
        questions.answer('toolu_1', null),
      ),
    );
    expect(recorded).toEqual([
      {
        kind: 'question.answered',
        payload: { toolUseId: 'toolu_1', answers: null },
      },
    ]);
    expect(result).toMatchObject({ behavior: 'deny' });
  });

  it('record nothing for one aborted, as when its Turn is cancelled', async () => {
    const abort = new AbortController();
    const { result, recorded } = await Effect.runPromise(
      asking(abort.signal, () => Effect.sync(() => abort.abort())),
    );
    expect(recorded).toEqual([]);
    expect(result).toMatchObject({ behavior: 'deny' });
  });
});
