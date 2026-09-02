import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';
import { fresh } from '../../env.js';
import { table } from '../10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';

// What the settings are: a theme and a page size. No id, because there is only ever one.
export const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
  perPage: Schema.Number,
}).build();

// Settings attached to the table as a single record, with the value to show before anyone writes one.
export const settings = table
  .singleEntity(Settings)
  .default({ theme: 'light', perPage: 20 });

// Runs a program against a brand-new, empty copy of the table in memory.
const onBoard = fresh('memory', table);

export const oneRecordThatExistsExactlyOnce = Story.make({
  title: 'One record that exists exactly once',
  description:
    'The board settings: a record with no id that is read, changed and reset without ever being missing.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does a read return before anything is written?', {
      answer:
        'The default you declared, never `null`: a single entity (a kind of thing the table holds exactly one of) always reads as something. Its update stamp is empty, which is how you can tell nothing has been written yet.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Read the settings of a brand-new table.
            const current = yield* settings.get();
            yield* Story.assert(
              'the default comes back',
              current.value.theme === 'light' && current.value.perPage === 20,
            );
            yield* Story.assert(
              'with an empty update stamp',
              current.meta._e === 'Settings' && current.meta._u === '',
            );
            return { current };
          }),
        ),
      ),
    }),
    Story.question('How do I change the settings?', {
      answer:
        'Either replace the whole record with `put`, or change part of it with `getAndUpdate`, which takes the same object or function as a task update. The first write turns the default into a real row with a real update stamp.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Replace the whole record.
            const replaced = yield* settings.put({
              theme: 'dark',
              perPage: 50,
            });
            // Change one field, leaving the other as it is.
            const updated = yield* settings.getAndUpdate({ perPage: 10 });
            // Compute the new value from the current one.
            const doubled = yield* settings.getAndUpdate((current) => ({
              perPage: current.perPage * 2,
            }));
            // Read what the table kept.
            const stored = yield* settings.get();
            yield* Story.assert(
              'the first write gave the record a real stamp',
              replaced.meta._u !== '' && replaced.value.theme === 'dark',
            );
            yield* Story.assert(
              'each change kept the other field and moved the stamp',
              updated.value.theme === 'dark' &&
                updated.value.perPage === 10 &&
                doubled.value.perPage === 20 &&
                doubled.meta._u > updated.meta._u,
            );
            yield* Story.assert(
              'the read matches the last write',
              stored.meta._u === doubled.meta._u,
            );
            return { replaced, updated, doubled, stored };
          }),
        ),
      ),
    }),
    Story.question('What does a reset do?', {
      answer:
        'It writes the default back as a real row, with a new update stamp. A reset is a write like any other; it does not return the record to the never-written state.',
      proof: onBoard(
        Story.trace(
          Effect.gen(function* () {
            // Change the theme.
            const changed = yield* settings.getAndUpdate({ theme: 'dark' });
            // Put the default back.
            const reset = yield* settings.reset();
            // Read what the table kept.
            const stored = yield* settings.get();
            yield* Story.assert(
              'the default is back, with a newer stamp',
              reset.value.theme === 'light' && reset.meta._u > changed.meta._u,
            );
            yield* Story.assert(
              'the read matches the reset, not the never-written state',
              stored.meta._u === reset.meta._u && stored.meta._u !== '',
            );
            return { changed, reset, stored };
          }),
        ),
      ),
    }),
  ],
});
