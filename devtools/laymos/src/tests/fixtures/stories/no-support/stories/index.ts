import { Effect } from 'effect';
import { Story } from '../../../../../story/index.js';

const solo = Story.make({
  title: 'solo story',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens without a support file?', {
      answer: 'The Story carries no support source.',
      proof: Effect.gen(function* () {
        yield* Story.assert('nothing to support', true);
        return null;
      }),
    }),
  ],
});

export default Story.group('no-support', [solo]);
