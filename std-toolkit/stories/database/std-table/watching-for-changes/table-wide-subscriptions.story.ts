import { Effect, Fiber, Stream } from 'effect';
import { Story } from 'laymos/story';
import { defaultBroadcaster } from 'std-toolkit/core';

import { agree, note, parity, settings, table } from '../../support.js';

export const tableWideSubscriptions = Story.make({
  title: 'Table-wide subscriptions',
  description:
    'The table itself hears about every entity it holds, not just one.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does subscribing to the table itself return?', {
      answer:
        'Every Change Notice broadcast through the table — across every entity it holds, not just one. It comes back untyped, because no single entity schema fits notes and singletons alike.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const everything = yield* Effect.forkChild(
              Stream.runCollect(table.subscribe().pipe(Stream.take(2))),
            );
            yield* Effect.sleep('20 millis');
            yield* note.insert({
              noteId: 'n1',
              notebook: 'work',
              title: 'Draft',
              status: 'open',
            });
            yield* settings.put({ theme: 'dark', perPage: 10 });
            const notices = yield* Fiber.join(everything);
            return { entities: notices.map((notice) => notice.meta._e).sort() };
          }).pipe(Effect.provide(defaultBroadcaster)),
        );
        yield* Story.assert(
          'both the Note and the Settings singleton arrived on one Stream',
          JSON.stringify(results.sqlite.entities) ===
            JSON.stringify(['Note', 'Settings']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
