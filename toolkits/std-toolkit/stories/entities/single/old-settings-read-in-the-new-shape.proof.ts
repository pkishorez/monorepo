import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { ESchema } from '@kstackz/std-toolkit/eschema';

// Last release: v1 settings. This release: v2 adds a font size.
const SettingsV1 = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
}).build();
const Settings = ESchema.make('Settings', {
  theme: Schema.Literals(['light', 'dark']),
})
  .evolve('v2', { fontSize: Schema.Number }, (v1) => ({ ...v1, fontSize: 14 }))
  .build();

// Two builds of the app over the same logical table.
const lastRelease = StdTable.make('app').primary('pk', 'sk').build();
const oldSettings = lastRelease
  .singleEntity(SettingsV1)
  .default({ theme: 'light' });
const table = StdTable.make('app').primary('pk', 'sk').build();
const settings = table
  .singleEntity(Settings)
  .default({ theme: 'light', fontSize: 16 });

export default Proof.make({
  title:
    'Settings saved by the last release read in the new shape, not as the default',
  description:
    'A stored v1 record is migrated on read; the new default only applies when nothing is stored.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const saved = yield* oldSettings
      .put({ theme: 'dark' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the last release stored v1 settings',
      saved.meta._v === 'v1',
    );
    return { db, saved };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const read = yield* settings.get();
      const updated = yield* settings.getAndUpdate({ fontSize: 18 });
      return { read, updated };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ read, updated }, { saved }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the stored theme survives and the migration fills the font size',
        read.value.theme === 'dark' && read.value.fontSize === 14,
      );
      yield* Proof.assert(
        'the read is the stored record at v2, not the default',
        read.meta._v === 'v2' && read.meta._u === saved.meta._u,
      );
      yield* Proof.assert(
        'the next write stores v2',
        updated.meta._v === 'v2' &&
          updated.value.fontSize === 18 &&
          updated.value.theme === 'dark',
      );
    }),
});
