import { Effect, Fiber, Stream } from 'effect';
import { Story } from 'laymos/story';
import { defaultBroadcaster } from 'std-toolkit/core';

import { agree, note, parity } from '../../support.js';

export const subscribingToANote = Story.make({
  title: 'Subscribing to a note',
  description:
    'A Stream of Change Notices for one entity, filled the moment a write commits.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('A note is inserted. Does a subscriber hear about it?', {
      answer:
        "Yes. Subscribing to the note's entity surface returns a Stream, and the moment the insert commits, a Change Notice carrying that same stored entity arrives on it.",
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const heard = yield* Effect.forkChild(
              Stream.runCollect(note.subscribe().pipe(Stream.take(1))),
            );
            yield* Effect.sleep('20 millis');
            const inserted = yield* note.insert({
              noteId: 'n1',
              notebook: 'work',
              title: 'Draft',
              status: 'open',
            });
            const [notice] = yield* Fiber.join(heard);
            return {
              noticeTitle: notice?.value.title ?? null,
              noticeStamp: notice?.meta._u ?? null,
              insertedStamp: inserted.meta._u,
            };
          }).pipe(Effect.provide(defaultBroadcaster)),
        );
        yield* Story.assert(
          'the subscriber received the exact write the insert returned',
          results.sqlite.noticeTitle === 'Draft' &&
            results.sqlite.noticeStamp === results.sqlite.insertedStamp,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What happens to a write that nobody subscribed to?', {
      answer:
        'Nothing breaks. Broadcasting is optional: the write still lands, and calling subscribe with no Broadcaster provided returns an empty Stream rather than hanging or failing.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert({
              noteId: 'solo',
              notebook: 'work',
              title: 'No one watching',
              status: 'open',
            });
            const notices = yield* Stream.runCollect(note.subscribe());
            const stored = yield* note.get({
              noteId: 'solo',
              notebook: 'work',
            });
            return {
              noticeCount: notices.length,
              storedTitle: stored?.value.title ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the write landed and the unwatched Stream stayed empty',
          results.sqlite.storedTitle === 'No one watching' &&
            results.sqlite.noticeCount === 0,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
