import { Effect } from 'effect';
import { Story } from '../../../../../story/index.js';
import { double } from './support.js';

const answer = 42;

const passing = Story.make({
  title: 'passing story',
  description: 'A Story whose questions all hold.',
  spine: true,
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
        const doubled = double(answer);
        yield* Story.assert('doubling holds', doubled === 84);
        return { doubled };
      }),
    }),
  ],
});

const failing = Story.make({
  title: 'failing story',
  description: 'A Story with an assertion that does not hold.',
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
  description: 'A Story whose proof dies before it finishes.',
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

export default Story.group(
  'basic',
  { description: 'The basic Stories fixture.' },
  [
    Story.group(
      'verdicts',
      { description: 'One Story per verdict: passed, failed, and errored.' },
      [passing, failing, erroring],
    ),
  ],
);
