import { Effect, Schema, Stream } from 'effect';
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
  title: 'A single entity that was never saved reads as its default',
  description:
    'There is nothing to create first: get returns the default with an empty update stamp, and writes nothing.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const rows = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert('the table holds no rows', rows.length === 0);
    return { db, rows: rows.length };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const read = yield* settings.get();
      const rows = yield* Stream.runCollect(table.scan());
      return { read, rowsAfterRead: rows.length };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ read, rowsAfterRead }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the value is the default',
        read.value.theme === 'light' && read.value.weekStartsOn === 'monday',
      );
      yield* Proof.assert('the update stamp is empty', read.meta._u === '');
      yield* Proof.assert('reading wrote nothing', rowsAfterRead === 0);
    }),
});
