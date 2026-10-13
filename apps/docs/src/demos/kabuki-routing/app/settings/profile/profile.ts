import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Routes } from '../../../routes/index.ts';

/** The profile form. Its draft is in its Model, so it is gone once the user leaves the page. */
export const ProfileActor = Actor.make('Profile', {
  props: Routes.Settings.Profile.props,
  model: Schema.Struct({ name: Schema.String }),
  message: Schema.TaggedUnion({ Renamed: { name: Schema.String } }),
}).build({
  init: () => ({ model: { name: 'Ada Lovelace' } }),
  on: { Renamed: ({ name }) => ({ model: { name } }) },
});
