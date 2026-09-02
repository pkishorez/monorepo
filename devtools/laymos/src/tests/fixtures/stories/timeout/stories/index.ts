import { Effect } from 'effect';
import { Story } from '../../../../../story/index.js';

const hanging = Story.make({
  title: 'hanging story',
  description: 'A Story whose second question never finishes.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Does the first question still pass?', {
      answer: 'Yes.',
      proof: Effect.gen(function* () {
        yield* Story.assert('it passes', true);
        return 'ok';
      }),
    }),
    Story.question('Does this question ever finish?', {
      answer: 'No, it hangs forever.',
      proof: Effect.never,
    }),
  ],
});

const patient = Story.make({
  title: 'patient story',
  description: 'A Story slower than the config timeout, with its own budget.',
  timeout: '2 seconds',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Does a story override outlive the config timeout?', {
      answer: 'Yes: the story-level timeout wins.',
      proof: Effect.gen(function* () {
        yield* Effect.sleep('300 millis');
        yield* Story.assert('it survived the config budget', true);
        return 'survived';
      }),
    }),
  ],
});

export default Story.group(
  'timeout',
  { description: 'Stories exercising the Story timeout.' },
  [hanging, patient],
);
