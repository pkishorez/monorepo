import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

import { agree, note, parity, table } from '../support.js';

const BookmarkSchema = EntityESchema.make('Bookmark', 'bookmarkId', {
  notebook: Schema.String,
  url: Schema.String,
}).build();

const bookmark = table
  .entity(BookmarkSchema)
  .primary({ pk: ['notebook'] })
  .build();

export const sharingOneTable = Story.make({
  title: 'Sharing one table',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How do two different entity types live in one table without colliding?',
      {
        answer:
          'Every key is prefixed with its entity name, so two entities keyed on the same value occupy separate partitions and each query sees only its own rows.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert({
                noteId: 'shared',
                notebook: 'work',
                title: 'Draft',
                status: 'open',
              });
              yield* bookmark.insert({
                bookmarkId: 'shared',
                notebook: 'work',
                url: 'https://example.com',
              });
              const notes = yield* note.query('primary', {
                pk: { notebook: 'work' },
                '>=': null,
              });
              const bookmarks = yield* bookmark.query('primary', {
                pk: { notebook: 'work' },
                '>=': null,
              });
              return {
                notes: notes.items.map(({ meta }) => meta._e),
                bookmarks: bookmarks.items.map(({ meta }) => meta._e),
                titles: notes.items.map(({ value }) => value.title),
                urls: bookmarks.items.map(({ value }) => value.url),
              };
            }),
          );
          yield* Story.assert(
            'each query returns only its own entity type',
            results.sqlite.notes.join() === 'Note' &&
              results.sqlite.bookmarks.join() === 'Bookmark',
          );
          yield* Story.assert(
            'the shared id and partition value do not overwrite each other',
            results.sqlite.titles.join() === 'Draft' &&
              results.sqlite.urls.join() === 'https://example.com',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
