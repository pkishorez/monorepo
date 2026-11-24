import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  Monoverse,
  MonoverseView,
  PlaceSchema,
  type Place,
} from '../monoverse/actor-monoverse/index.js';

/*
 * `/monoverse`: the Monoverse Tool, with its Place in the address, so a
 * link opens it where it was:
 * `?project=<saved id>&package=<folder>&branch=<name>&base=<name>&changes=1`,
 * each left out while it is none (or off). The address is all the page
 * knows: it keeps no Model.
 *
 * 1. Start  the Tool starts at the Place the address names.
 * 2. Move   the Tool says where the user moved, and the page writes it,
 *           unless the address names it already: a new history entry for
 *           another project or Package, so Back goes back there; in place
 *           for a branch, Compare to or Changes, and for a project the
 *           Tool could not find.
 * 3. Follow Back, Forward or a typed address hands the Tool the Place it
 *           now names, as Props, and the same Tool moves there. Its own
 *           move comes back that way too, naming the Place it shows:
 *           nothing moves.
 */

export const MonoversePage = Page.define({
  path: '/monoverse',
  query: {
    project: Schema.optionalKey(Schema.String),
    package: Schema.optionalKey(Schema.String),
    branch: Schema.optionalKey(Schema.String),
    base: Schema.optionalKey(Schema.String),
    changes: Schema.optionalKey(Schema.String),
  },
  message: Schema.TaggedUnion({ Moved: { place: PlaceSchema } }),
});

interface Query {
  readonly project?: string;
  readonly package?: string;
  readonly branch?: string;
  readonly base?: string;
  readonly changes?: string;
}

/** The Place an address names. */
const placeOf = (query: Query): Place => ({
  project: query.project ?? null,
  package: query.package ?? null,
  branch: query.branch ?? null,
  base: query.base ?? null,
  changes: query.changes === '1',
});

/** The page's Route at a Place, naming only what is not none. */
const routeOf = (place: Place) => ({
  _tag: 'Monoverse' as const,
  ...(place.project === null ? {} : { project: place.project }),
  ...(place.package === null ? {} : { package: place.package }),
  ...(place.branch === null ? {} : { branch: place.branch }),
  ...(place.base === null ? {} : { base: place.base }),
  ...(place.changes ? { changes: '1' } : {}),
});

export const MonoversePageLive = MonoversePage.build({
  children: {
    tool: Actor.child(Monoverse, {
      // 1. Start
      input: ({ props }) => placeOf(props.query),
      // 3. Follow
      props: ({ props }) => placeOf(props.query),
      // 2. Move
      emits: {
        Moved: ({ _tag, ...place }) => ({ _tag: 'Moved', place }),
      },
    }),
  },
  on: {
    // 2. Move
    Moved: ({ place }, { props }) => {
      const named = placeOf(props.query);
      const route = routeOf(place);
      if (JSON.stringify(route) === JSON.stringify(routeOf(named))) return {};
      const elsewhere =
        place.project !== named.project || place.package !== named.package;
      return {
        command:
          elsewhere && place.project !== null
            ? Router.push(route)
            : Router.replace(route),
      };
    },
  },
});

export const MonoversePageView = View.make(
  MonoversePageLive,
  ({ children }) => <MonoverseView instance={children.tool} />,
);
