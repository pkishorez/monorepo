import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Routes } from '../../../routes/index.ts';

/**
 * The share dialog: a Route of its own. Closing goes Back when the app came
 * from the project, and replaces the entry with it otherwise, as after a
 * reload: Back never opens it again.
 */
export const ShareActor = Actor.make('Share', {
  requires: [Navigation],
  props: Routes.Projects.Share.props,
  model: Schema.Struct({ copied: Schema.Boolean }),
  message: Schema.TaggedUnion({ Copied: {}, Closed: {} }),
}).build({
  init: () => ({ model: { copied: false } }),
  on: {
    Copied: () => ({ model: { copied: true } }),
    Closed: (_, { props }) => ({
      command: Router.backTo(Routes.Projects.Project({ id: props.id })),
    }),
  },
});
