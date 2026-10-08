import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { ESchema } from '@kstackz/std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
  weekStartsOn: Schema.Literals(['monday', 'sunday']),
}).build();

const table = StdTable.make('app').primary('pk', 'sk').build();
const settings = table
  .singleEntity(Settings)
  .default({ theme: 'light', weekStartsOn: 'monday' });

export default Proof.make({
  title: 'Updating a never-saved record merges into its default and saves it',
  description:
    'getAndUpdate reads the current value (the default when nothing is stored), merges the partial, and writes the result.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const before = yield* settings.get().pipe(Effect.provide(db.layer));
    yield* Proof.assert('nothing is stored yet', before.meta._u === '');
    return { db, before };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const fromDefault = yield* settings.getAndUpdate({ theme: 'dark' });
      const fromStored = yield* settings.getAndUpdate((current) => ({
        weekStartsOn: current.theme === 'dark' ? 'sunday' : 'monday',
      }));
      return { fromDefault, fromStored };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ fromDefault, fromStored }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the first update kept the default for the field it did not name',
        fromDefault.value.theme === 'dark' &&
          fromDefault.value.weekStartsOn === 'monday',
      );
      yield* Proof.assert(
        'the first update was saved',
        fromDefault.meta._u !== '',
      );
      yield* Proof.assert(
        'the callback saw the stored value',
        fromStored.value.theme === 'dark' &&
          fromStored.value.weekStartsOn === 'sunday',
      );
    }),
});
