import { createLiveQueryCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { createStdSync } from 'std-toolkit/sync';
import { fresh, platform } from '../../env.js';
import { table } from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import {
  Settings,
  settings,
} from '../../02-more-ways-in/12-one-record-that-exists-exactly-once/one-record-that-exists-exactly-once.story.js';
import {
  browserRuntime,
  until,
} from '../25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';

// Runs a program against a brand-new, empty copy of the table in memory: the server.
const onBoard = fresh('memory', table);

// A fresh app for each question.
const openApp = Effect.map(browserRuntime, (runtime) =>
  createStdSync({
    name: 'board-settings',
    platform: platform(),
    runtime,
    options: { gcTime: 1 },
  }),
);

export const boardSettingsInTheBrowser = Story.make({
  title: 'Board settings in the browser',
  description:
    'The single settings record from chapter 12, shown and changed from the browser.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does a single record reach the browser?', {
      answer:
        "Through `singleItemCollection`: a collection that holds exactly one row, with no id, read through a `source`. `once` reads it one time when the collection starts; `poll` reads it again on a schedule; `subscribe` takes a stream of replacements. The row's key is the record's name, `Settings`.",
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            // The server holds dark settings.
            yield* settings.put({ theme: 'dark', perPage: 50 });
            const app = yield* openApp;
            // The collection: one record, read once from the server.
            const current = app.singleItemCollection({
              schema: Settings,
              source: ({ once }) => once({ fetch: () => settings.get() }),
            });
            // A screen watching it.
            const screen = createLiveQueryCollection({
              query: (q) => q.from({ settings: current }),
              startSync: true,
              gcTime: 1,
            });
            yield* Effect.promise(() => screen.preload());
            yield* until(() => screen.size === 1);
            const shown = screen.toArray.map(({ theme, perPage }) => ({
              theme,
              perPage,
            }));
            const keys = [...screen.keys()];
            yield* Story.assert(
              'the screen shows the one record from the server',
              shown[0]?.theme === 'dark' &&
                shown[0].perPage === 50 &&
                shown.length === 1,
            );
            yield* Story.assert(
              'its key is the record name',
              keys.join() === 'Settings',
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { shown, keys };
          }),
        ),
      ),
    }),
    Story.question('And changing it from the browser?', {
      answer:
        'Give it an `onUpdate` that gets only the changed fields (`updates`) and writes them to the server with the call from chapter 12. The screen shows the change at once; the confirmed record follows when the server answers.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            const app = yield* openApp;
            // The collection, now able to write the changed fields back.
            const current = app.singleItemCollection({
              schema: Settings,
              source: ({ once }) => once({ fetch: () => settings.get() }),
              onUpdate: ({ updates }) => settings.getAndUpdate(updates),
            });
            const screen = createLiveQueryCollection({
              query: (q) => q.from({ settings: current }),
              startSync: true,
              gcTime: 1,
            });
            yield* Effect.promise(() => screen.preload());
            yield* until(() => screen.size === 1);
            // Switch to the dark theme from the browser.
            const write = current.update('Settings', (row) => {
              row.theme = 'dark';
            });
            // Straight away the screen shows it, not yet confirmed.
            const atOnce = screen.toArray.map(
              ({ theme, perPage, $synced }) => ({ theme, perPage, $synced }),
            );
            // Wait for the server to confirm it.
            yield* Effect.promise(() => write.isPersisted.promise);
            const onServer = yield* settings.get();
            yield* Story.assert(
              'the screen switched at once, keeping the other field',
              atOnce[0]?.theme === 'dark' &&
                atOnce[0].perPage === 20 &&
                atOnce[0].$synced === false,
            );
            yield* Story.assert(
              'the server stored the change',
              write.state === 'completed' &&
                onServer.value.theme === 'dark' &&
                onServer.value.perPage === 20,
            );
            yield* Effect.promise(() => screen.cleanup());
            yield* Effect.promise(() => app.dispose());
            return { atOnce, onServer };
          }),
        ),
      ),
    }),
  ],
});
