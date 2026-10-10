import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { ESchema } from '@kstackz/std-toolkit/eschema';

// Settings existed before the app adopted ESchema, so stored values carry no `_v`.
const Settings = ESchema.make('Settings', {
  theme: Schema.String,
})
  .evolve('v2', { fontSize: Schema.Number }, (v1) => ({ ...v1, fontSize: 14 }))
  .build();

export default Proof.make({
  title: 'Data saved before you adopted versions reads as version 1',
  description:
    'A value with no version stamp is treated as v1 and migrated, so adopting ESchema needs no backfill.',
  prepare: Effect.gen(function* () {
    const legacy = { theme: 'dark' };
    yield* Proof.assert(
      'the legacy value has no version stamp',
      !('_v' in legacy),
    );
    return { legacy };
  }),
  act: ({ legacy }) =>
    Schema.decodeUnknownEffect(Settings.schema)(legacy).pipe(
      Effect.map((decoded) => ({ decoded })),
    ),
  verify: ({ decoded }) =>
    Proof.assert(
      'it decodes as v1 and migrates to v2',
      decoded.theme === 'dark' && decoded.fontSize === 14,
    ),
});
