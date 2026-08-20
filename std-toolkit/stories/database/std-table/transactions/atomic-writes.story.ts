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
  description: 'Several writes that land together, or not at all.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note moves between notebooks, which needs two writes. How do they land together?',
      {
        answer:
          'Build one op for each write and give the list to `transact`. Each row then lands together.',
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
      },
    ),
    Story.question('What happens when one of them is refused?', {
      answer:
        'The whole batch fails and nothing is written. The other ops do not land.',
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
    Story.question('What does an empty batch do?', {
      answer: 'It succeeds and writes nothing. An empty batch is not an error.',
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
