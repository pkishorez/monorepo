import { createLiveQueryCollection } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import type { StdTableService } from '@kstackz/std-toolkit/db';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { createStdSync, strategy } from '@kstackz/std-toolkit/sync';
import { fresh, platform } from '../../env.js';
import { table } from '../../02-more-ways-in/10-finding-one-persons-tasks-across-every-board/finding-one-persons-tasks-across-every-board.story.js';
import {
  browserRuntime,
  until,
} from '../25-showing-the-board-in-the-browser/showing-the-board-in-the-browser.story.js';

// The settings from chapter 12, with one change: an id field, `settingsId`. There is still only one record; it always has the id `board`.
export const BoardSettings = EntityESchema.make('BoardSettings', 'settingsId', {
  theme: Schema.Literals(['light', 'dark']),
  perPage: Schema.Number,
}).build();

// The one fixed id.
const settingsId = 'board';

// The settings attached to the table like any other entity, keyed by that id.
export const boardSettings = table
  .entity(BoardSettings)
  .primary({ pk: ['settingsId'] })
  .build();

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

// How the collection reads the server: the one record, if it changed after `after`. With no `pollEvery`, the collection reads once when it starts and stops there.
const readOnce = strategy.oldToNew<
  typeof BoardSettings.Type,
  StdTableService<'board'>
>({
  fetch: ({ after }) =>
    boardSettings
      .get({ settingsId })
      .pipe(
        Effect.map((row) =>
          row === null || (after !== null && row.meta._u <= after.meta._u)
            ? []
            : [row],
        ),
      ),
});

export const boardSettingsInTheBrowser = Story.make({
  title: 'Board settings in the browser',
  description:
    'The board settings from chapter 12, kept as one row with a fixed id, shown and changed from the browser.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does a single record reach the browser?', {
      answer:
        'As an ordinary collection that happens to hold one row. A collection needs an id for every row, and a record with no id is modeled, for now, as one fixed key: the settings get a `settingsId` field that is always `board`. The collection reads it with `strategy.oldToNew` and a `global` strategy, which runs as soon as the collection is watched. With only a `fetch`, it reads once when the collection starts; add `pollEvery` to read it again on a schedule, or `subscribe` to be sent each change.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            // The server holds dark settings.
            yield* boardSettings.insert({
              settingsId,
              theme: 'dark',
              perPage: 50,
            });
            const app = yield* openApp;
            // The collection: one record, read once from the server.
            const current = app.collection(BoardSettings, {
              sync: { global: readOnce },
            });
            // A screen watching it.
            const screen = createLiveQueryCollection({
              query: (q) => q.from({ settings: current }),
              startSync: true,
              // Nothing subscribes to this screen the way a page would, so keep it
              // until the chapter cleans it up.
              gcTime: 60_000,
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
              'its key is the fixed id',
              keys.join() === settingsId,
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
        'Exactly as with a task in chapter 26: give the collection an `onUpdate` that gets only the changed fields (`updates`), writes them to the server under the fixed id, and returns what the server stored. The screen shows the change at once; the confirmed record follows when the server answers.',
      proof: onBoard(
        Story.flow(
          Effect.gen(function* () {
            // The server holds the light settings.
            yield* boardSettings.insert({
              settingsId,
              theme: 'light',
              perPage: 20,
            });
            const app = yield* openApp;
            // The collection, now able to write the changed fields back.
            const current = app.collection(BoardSettings, {
              sync: { global: readOnce },
              onUpdate: ({ updates }) =>
                boardSettings.getAndUpdate({ settingsId }, updates),
            });
            const screen = createLiveQueryCollection({
              query: (q) => q.from({ settings: current }),
              startSync: true,
              // Nothing subscribes to this screen the way a page would, so keep it
              // until the chapter cleans it up.
              gcTime: 60_000,
            });
            yield* Effect.promise(() => screen.preload());
            yield* until(() => screen.size === 1);
            // Switch to the dark theme from the browser.
            const write = current.update(settingsId, (row) => {
              row.theme = 'dark';
            });
            // Straight away the screen shows it, not yet confirmed.
            const atOnce = screen.toArray.map(
              ({ theme, perPage, $synced }) => ({ theme, perPage, $synced }),
            );
            // Wait for the server to confirm it.
            yield* Effect.promise(() => write.isPersisted.promise);
            const onServer = yield* boardSettings.get({ settingsId });
            yield* Story.assert(
              'the screen switched at once, keeping the other field',
              atOnce[0]?.theme === 'dark' &&
                atOnce[0].perPage === 20 &&
                atOnce[0].$synced === false,
            );
            yield* Story.assert(
              'the server stored the change',
              write.state === 'completed' &&
                onServer?.value.theme === 'dark' &&
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
