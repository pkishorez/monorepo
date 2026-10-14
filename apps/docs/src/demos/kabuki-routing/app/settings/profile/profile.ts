import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/**
 * The profile form, what Settings draws where the URL ends at it. Its draft
 * is in its Model, so it is gone once the user leaves.
 */
export const ProfileActor = Actor.make('Profile', {
  model: Schema.Struct({ name: Schema.String }),
  message: Schema.TaggedUnion({ Renamed: { name: Schema.String } }),
}).build({
  init: () => ({ model: { name: 'Ada Lovelace' } }),
  on: { Renamed: ({ name }) => ({ model: { name } }) },
});
