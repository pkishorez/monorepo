import { Effect, Fiber, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { defaultBroadcaster } from '@kstackz/std-toolkit/core';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { ESchema } from '@kstackz/std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
}).build();

const table = StdTable.make('app').primary('pk', 'sk').build();
const settings = table.singleEntity(Settings).default({ theme: 'light' });

export default Proof.make({
  title: 'Reset saves the default as a real record that subscribers hear',
  description:
    'A single entity is never deleted. Reset stores the default with a new update stamp, so get and the change notice agree.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const changed = yield* settings
      .put({ theme: 'dark' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'settings were changed from the default',
      changed.value.theme === 'dark',
    );
    return { db, changed };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const listening = yield* Effect.forkChild(
        Stream.runCollect(settings.subscribe().pipe(Stream.take(1))),
        { startImmediately: true },
      );
      const reset = yield* settings.reset();
      const read = yield* settings.get();
      const [notice] = yield* Fiber.join(listening);
      return { reset, read, notice };
    }).pipe(Effect.provide(db.layer), Effect.provide(defaultBroadcaster)),
  verify: ({ reset, read, notice }, { changed }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the value is the default again',
        read.value.theme === 'light',
      );
      yield* Proof.assert(
        'it is a stored record with a newer stamp, not an absence',
        reset.meta._u !== '' &&
          reset.meta._u > changed.meta._u &&
          read.meta._u === reset.meta._u,
      );
      yield* Proof.assert(
        'the change notice carries the same stamp',
        notice?.meta._u === reset.meta._u,
      );
    }),
});
