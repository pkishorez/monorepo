import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { ESchema } from '@kestack/std-toolkit/eschema';

const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
  weekStartsOn: Schema.Literals(['monday', 'sunday']),
}).build();

const table = StdTable.make('app')
  .primary('pk', 'sk')
  .singleEntity(Settings, {
    default: { theme: 'light', weekStartsOn: 'monday' },
  })
  .build();

export default Proof.make({
  title: 'Put saves the whole record and get reads it back',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const before = yield* table.Settings.get().pipe(Effect.provide(db.layer));
    yield* Proof.assert('settings start at the default', before.meta._u === '');
    return { db, before };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const first = yield* table.Settings.put({
        theme: 'dark',
        weekStartsOn: 'sunday',
      });
      const second = yield* table.Settings.put({
        theme: 'light',
        weekStartsOn: 'sunday',
      });
      const read = yield* table.Settings.get();
      return { first, second, read };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ first, second, read }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the first put is stored with a real stamp',
        first.meta._u !== '',
      );
      yield* Proof.assert(
        'get returns the last put, value and stamp',
        read.value.theme === 'light' &&
          read.value.weekStartsOn === 'sunday' &&
          read.meta._u === second.meta._u,
      );
      yield* Proof.assert(
        'each put moves the stamp forward',
        first.meta._u < second.meta._u,
      );
      yield* Proof.budget('StdTable.put', '50 millis');
    }),
});
