import { Effect } from 'effect';
import { Story } from '../../../../../story/index.js';

const answer = 42;

const passing = Story.make({
  title: 'passing story',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What is the answer?', {
      answer: 'It is 42.',
      proof: Effect.gen(function* () {
        const value = yield* Story.trace(
          Effect.succeed(answer).pipe(Effect.withSpan('compute-answer')),
        );
        yield* Story.assert('the answer is 42', value === 42);
        return value;
      }),
    }),
    Story.question('What does doubling produce?', {
      answer: 'Twice the answer.',
      proof: Effect.gen(function* () {
        const doubled = answer * 2;
        yield* Story.assert('doubling holds', doubled === 84);
        return { doubled };
      }),
    }),
  ],
});

const failing = Story.make({
  title: 'failing story',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens when an assertion does not hold?', {
      answer: 'The question fails.',
      proof: Effect.gen(function* () {
        yield* Story.assert('holds', true);
        yield* Story.assert('does not hold', false);
        return null;
      }),
    }),
  ],
});

const erroring = Story.make({
  title: 'erroring story',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens when the proof dies?', {
      answer: 'The question errors.',
      proof: Effect.gen(function* () {
        yield* Story.assert('reached before the crash', true);
        yield* Effect.fail(new Error('boom'));
      }),
    }),
  ],
});

export default Story.group('basic', [
  Story.group('verdicts', [passing, failing, erroring]),
]);
