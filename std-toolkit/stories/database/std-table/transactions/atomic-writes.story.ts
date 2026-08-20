import { Effect } from 'effect';
import { Story } from 'laymos/story';

import { agree, note, parity, reasonOf, table } from '../../support.js';

const draft = (noteId: string) => ({
  noteId,
  notebook: 'work',
  title: noteId,
  status: 'open',
});

export const atomicWrites = Story.make({
  title: 'Atomic writes',
  description: 'Several writes that land together or not at all.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How do you commit several writes as one unit?', {
      answer:
        'Build a buffered op per write with `insertOp` and hand the whole list to `table.transact` — every row lands together.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const ops = yield* Effect.all([
              note.insertOp(draft('n1')),
              note.insertOp(draft('n2')),
              note.insertOp(draft('n3')),
            ]);
            const written = yield* table.transact(ops);
            const page = yield* note.query('primary', {
              pk: { notebook: 'work' },
              '>=': null,
            });
            return {
              written: written.length,
              stored: page.items.map(({ value }) => value.noteId),
            };
          }),
        );
        yield* Story.assert(
          'all three rows land in one commit',
          results.sqlite.written === 3 &&
            results.sqlite.stored.join() === 'n1,n2,n3',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What happens to the rest if one op fails?', {
      answer:
        'Nothing is written — the whole batch is rejected, so the sibling row that would have succeeded is absent afterwards.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(draft('taken'));
            const ops = yield* Effect.all([
              note.insertOp(draft('sibling')),
              note.insertOp(draft('taken')),
            ]);
            const error = yield* table.transact(ops).pipe(Effect.flip);
            const sibling = yield* note.get({
              noteId: 'sibling',
              notebook: 'work',
            });
            return {
              reason: reasonOf(error),
              siblingWritten: sibling !== null,
            };
          }),
        );
        yield* Story.assert(
          'the batch is rejected and the sibling row was never written',
          results.sqlite.siblingWritten === false,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What does an empty transaction do?', {
      answer:
        'Nothing — it commits no rows and returns an empty list instead of failing.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const written = yield* table.transact([]);
            return { written: written.length };
          }),
        );
        yield* Story.assert(
          'an empty batch commits nothing',
          results.sqlite.written === 0,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
