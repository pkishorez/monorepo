import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  Monoverse,
  MonoverseView,
  PlaceSchema,
  type Place,
} from './actor-monoverse/index.js';

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

const placeOf = (query: Query): Place => ({
  project: query.project ?? null,
  package: query.package ?? null,
  branch: query.branch ?? null,
  base: query.base ?? null,
  changes: query.changes === '1',
});

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
      input: ({ props }) => placeOf(props.query),
      props: ({ props }) => placeOf(props.query),
      emits: {
        Moved: ({ _tag, ...place }) => ({ _tag: 'Moved', place }),
      },
    }),
  },
  on: {
    Moved: ({ place }, { props }) => {
      const named = placeOf(props.query);
      const route = routeOf(place);
      if (JSON.stringify(route) === JSON.stringify(routeOf(named))) return {};
      const elsewhere =
        place.project !== named.project || place.package !== named.package;
      const found = place.project !== null;
      return {
        command:
          elsewhere && found ? Router.push(route) : Router.replace(route),
      };
    },
  },
});

export const MonoversePageView = View.make(
  MonoversePageLive,
  ({ children }) => <MonoverseView instance={children.tool} />,
);
