import { Effect } from 'effect';
import { Story } from '../../../../../story/index.js';

const passing = Story.make({
  title: 'passing story',
  description: 'Holds its assertions.',
  markdown: 'Captures a trace and holds its assertions.',
  run: Effect.gen(function* () {
    const value = yield* Story.trace(
      'compute the answer',
      Effect.succeed(42).pipe(Effect.withSpan('compute-answer')),
    );
    yield* Story.assert('the answer is 42', value === 42);
  }),
});

const failing = Story.make({
  title: 'failing story',
  description: 'Fails an assertion.',
  markdown: 'Records one false assertion.',
  run: Effect.gen(function* () {
    yield* Story.exec('plain checks', Effect.void);
    yield* Story.assert('holds', true);
    yield* Story.assert('does not hold', false);
  }),
});

const erroring = Story.make({
  title: 'erroring story',
  description: 'Dies mid-run.',
  markdown: 'Dies mid-narrative after one capture.',
  run: Effect.gen(function* () {
    yield* Story.assert('reached before the crash', true);
    yield* Effect.fail(new Error('boom'));
  }),
});

export default Story.group({
  title: 'basic',
  description: 'Fixture package exercising every verdict.',
  markdown: 'A root group with one subgroup per verdict scenario.',
  children: [
    Story.group({
      title: 'verdicts',
      description: 'One story per verdict.',
      markdown: 'Passing, failing, and erroring stories in order.',
      children: [passing, failing, erroring],
    }),
  ],
});
