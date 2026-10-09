import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { Location, heardUrl, pushUrl } from '../location/index.js';
import { People } from './people/index.js';
import { RouteState, routeFrom } from './route/index.js';

/*
 * Routing without a router: each route is a State of the root, and the URL
 * is a Location Service in the app's Layer.
 *
 * The URL comes first, as in Foldkit. A click Sends `ClickedLink`, whose
 * Command pushes the path; the Location hears it, and the State's Lifetime
 * sends `ChangedUrl`, whose Update turns the path into the next State. Back
 * and forward arrive the same way. Only the People State has a Child: the
 * search page, which exists while that route shows.
 *
 * Every State needs the same Lifetime, because a Lifetime belongs to one
 * State: each starts listening on entry, from the path it was entered with.
 */

const listen = ({ model }: { readonly model: { readonly path: string } }) =>
  heardUrl(model.path === '' ? null : model.path);

export const Routing = Node.make('Routing', {
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
  lifetime: {
    Opening: listen,
    Home: listen,
    Nested: listen,
    People: listen,
    Person: listen,
    FilesIndex: listen,
    Files: listen,
    NotFound: listen,
  },
  update: {
    '*': {
      ChangedUrl: ({ path }) => ({ model: { path }, state: routeFrom(path) }),
      ClickedLink: ({ path }) => ({ commands: [pushUrl(path)] }),
    },
  },
});

export { HashLocation as RoutingLive } from '../location/index.js';
