import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { Location, heardUrl, pushUrl, readPath } from '../location/index.js';

/*
 * A gallery whose artworks grow into their own page.
 *
 * Routes are the root's States, and the filter text is Model data, so it is
 * kept when an artwork is opened and closed again.
 *
 * Unlike the routing demo, a click changes the State first and pushes the
 * URL after, in a Command. The View wraps the click's Send in a View
 * Transition, which needs the new page in the DOM before the click returns:
 * waiting for the URL to come back through a Lifetime would be too late.
 * Back and forward still arrive from the URL, as `ChangedUrl`.
 */

const Route = Schema.TaggedUnion({
  Opening: {},
  Gallery: {},
  Artwork: { artworkId: Schema.Number },
  NotFound: { path: Schema.String },
});
type Route = typeof Route.Type;

export const routeFrom = (path: string): Route => {
  const [first, second, ...rest] = readPath(path).segments;
  if (first === undefined) return { _tag: 'Gallery' };
  if (first === 'artwork' && rest.length === 0 && /^\d+$/.test(second ?? ''))
    return { _tag: 'Artwork', artworkId: Number(second) };
  return { _tag: 'NotFound', path };
};

const listen = ({ model }: { readonly model: { readonly path: string } }) =>
  heardUrl(model.path === '' ? null : model.path);

export const ViewTransitions = Node.make('ViewTransitions', {
  requires: { location: Location },
  model: Schema.Struct({ path: Schema.String, filter: Schema.String }),
  state: Route,
  message: Schema.TaggedUnion({
    ChangedUrl: { path: Schema.String },
    ClickedLink: { path: Schema.String },
    EditedFilter: { filter: Schema.String },
  }),
}).build({
  init: () => ({ model: { path: '', filter: '' }, state: { _tag: 'Opening' } }),
  lifetime: {
    Opening: listen,
    Gallery: listen,
    Artwork: listen,
    NotFound: listen,
  },
  update: {
    Gallery: {
      EditedFilter: ({ filter }, { model }) => ({
        model: { ...model, filter },
      }),
    },
    '*': {
      ChangedUrl: ({ path }, { model }) => ({
        model: { ...model, path },
        state: routeFrom(path),
      }),
      ClickedLink: ({ path }, { model }) => ({
        model: { ...model, path },
        state: routeFrom(path),
        commands: [pushUrl(path)],
      }),
    },
  },
});

export { HashLocation as ViewTransitionsLive } from '../location/index.js';
