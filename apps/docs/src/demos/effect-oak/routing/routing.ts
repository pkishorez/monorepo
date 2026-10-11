import { Effect, Schema, Stream } from 'effect';
import { Actor } from 'effect-oak';
import { Location, heardUrl, pushUrl } from '../location/index.js';
import { People } from './people/index.js';
import { RouteState, routeFrom } from './route/index.js';

/*
 * Routing without a router: each route is a State of the root, and the URL
 * is a Location Capability in the app's Layer.
 *
 * The URL comes first, as in Foldkit. A click Sends `ClickedLink`, whose
 * Command pushes the path; the Location hears it, and the `listen` Worker
 * sends `ChangedUrl`, whose Update turns the path into the next State. Back
 * and forward arrive the same way. Only the People State has a Child: the
 * search page, which exists while that route shows.
 *
 * The Worker is owned by the Instance, so it listens across every State,
 * from the path the Model shows when it starts.
 */

const listen = (self: {
  readonly get: Effect.Effect<{ readonly model: { readonly path: string } }>;
  readonly send: (message: {
    readonly _tag: 'ChangedUrl';
    readonly path: string;
  }) => Effect.Effect<void>;
}) =>
  Effect.gen(function* () {
    const { model } = yield* self.get;
    yield* heardUrl(model.path === '' ? null : model.path).pipe(
      Stream.runForEach(self.send),
    );
  });

export const Routing = Actor.make('Routing', {
  requires: { location: Location },
  /** The path the current State came from, drawn in the demo's address bar. */
  model: Schema.Struct({ path: Schema.String }),
  state: RouteState,
  message: Schema.TaggedUnion({
    ChangedUrl: { path: Schema.String },
    ClickedLink: { path: Schema.String },
  }),
  children: { People: { people: People } },
}).build({
  init: () => ({ model: { path: '' }, state: { _tag: 'Opening' } }),
  workers: { listen: { run: listen } },
  update: {
    '*': {
      ChangedUrl: ({ path }) => ({ model: { path }, state: routeFrom(path) }),
      ClickedLink: ({ path }) => ({ command: pushUrl(path) }),
    },
  },
});

export { HashLocation as RoutingLive } from '../location/index.js';
