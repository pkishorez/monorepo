import { Schema } from 'effect';
import { Navigation, Route, Router } from '@kestack/kabuki/routing';
import { Routes } from '../../../../routes/index.ts';

/**
 * The share dialog: a page under the project, with a Route of its own.
 * Closing goes Back when the app came from the project, and replaces the
 * entry with it otherwise, as after a reload: Back never opens it again.
 */
export const Share = Route.page({
  path: '/share',
  requires: [Navigation],
  model: Schema.Struct({ copied: Schema.Boolean }),
  message: Schema.TaggedUnion({ Copied: {}, Closed: {} }),
}).build({
  init: () => ({ model: { copied: false } }),
  on: {
    Copied: () => ({ model: { copied: true } }),
    // The project's id is a param of the page above: `route.params` holds every one down to here.
    Closed: (_, { props }) => ({
      command: Router.backTo(() =>
        Routes.Projects.Project({ id: props.route.params['id'] as number }),
      ),
    }),
  },
});
