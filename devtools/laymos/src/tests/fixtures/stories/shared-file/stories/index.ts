import { Effect } from 'effect';
import { Story } from '../../../../../story/index.js';

const subject = 'the row';

const first = Story.make({
  title: 'first story',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does the first story prove?', {
      answer: 'That it keeps its own proof snippet.',
      proof: Effect.gen(function* () {
        yield* Story.assert('first proof ran', true);
        return 'first';
      }),
    }),
  ],
});

const second = Story.make({
  title: 'second story',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(`What does ${subject} look like when read back?`, {
      answer: 'The same value on both sides.',
      proof: Effect.gen(function* () {
        const row = { id: 'a' };
        yield* Story.assert('second proof ran', true);
        return { written: row, read: row };
      }),
    }),
  ],
});

export default Story.group('shared-file', [first, second]);
