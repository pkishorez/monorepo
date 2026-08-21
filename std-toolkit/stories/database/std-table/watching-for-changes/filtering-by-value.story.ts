import { Effect, Fiber, Stream } from 'effect';
import { Story } from 'laymos/story';
import { defaultBroadcaster } from 'std-toolkit/core';

import { agree, note, parity } from '../../support.js';

export const filteringByValue = Story.make({
  title: 'Filtering by value',
  description:
    'A partial value narrows a subscription to only the writes whose fields match it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does a subscriber hear about only the notes it cares about?',
      {
        answer:
          'A filter narrows the Stream: subscribe takes a partial value, and only writes whose fields match it, exactly, are delivered.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const urgentOnly = yield* Effect.forkChild(
                Stream.runCollect(
                  note.subscribe({ status: 'urgent' }).pipe(Stream.take(1)),
                ),
              );
              yield* Effect.sleep('20 millis');
              yield* note.insert({
                noteId: 'calm',
                notebook: 'work',
                title: 'Calm',
                status: 'open',
              });
              yield* note.insert({
                noteId: 'fire',
                notebook: 'work',
                title: 'Fire',
                status: 'urgent',
              });
              const [notice] = yield* Fiber.join(urgentOnly);
              return { title: notice?.value.title ?? null };
            }).pipe(Effect.provide(defaultBroadcaster)),
          );
          yield* Story.assert(
            'only the write matching the filter arrived',
            results.sqlite.title === 'Fire',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question(
      'A note matches the filter, then an update moves it away from that filter. Does the subscriber still hear about it?',
      {
        answer:
          "No. The filter is checked against each write's resulting value, not tracked per note — once an update moves a note's fields away from the filter, later writes to that same note stop matching.",
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              const urgent = yield* Effect.forkChild(
                Stream.runCollect(
                  note.subscribe({ status: 'urgent' }).pipe(Stream.take(2)),
                ),
              );
              yield* Effect.sleep('20 millis');
              yield* note.insert({
                noteId: 'n1',
                notebook: 'work',
                title: 'First fire',
                status: 'urgent',
              });
              yield* note.getAndUpdate(
                { noteId: 'n1', notebook: 'work' },
                { status: 'calm' },
              );
              yield* note.insert({
                noteId: 'n2',
                notebook: 'work',
                title: 'Second fire',
                status: 'urgent',
              });
              const notices = yield* Fiber.join(urgent);
              return { ids: notices.map((notice) => notice.value.noteId) };
            }).pipe(Effect.provide(defaultBroadcaster)),
          );
          yield* Story.assert(
            'the note that cooled down is skipped, not tracked across its update',
            JSON.stringify(results.sqlite.ids) === JSON.stringify(['n1', 'n2']),
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
