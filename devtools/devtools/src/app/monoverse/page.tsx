import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RefreshCwIcon } from 'lucide-react';
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
  model: { reloads: Schema.Number },
  message: {
    Moved: { place: PlaceSchema },
    Reloaded: Schema.Struct({}).annotate({
      description:
        'Read the project again from disk and git: its Packages, branches, changes and the open file, keeping what is open and selected',
    }),
  },
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
  init: () => ({ model: { reloads: 0 } }),
  children: {
    tool: Actor.child(Monoverse, {
      input: ({ props }) => placeOf(props.query),
      props: ({ model, props }) => ({
        ...placeOf(props.query),
        reloads: model.reloads,
      }),
      emits: {
        Moved: ({ _tag, ...place }) => ({ _tag: 'Moved', place }),
      },
    }),
  },
  on: {
    Reloaded: (_, { model }) => ({ model: { reloads: model.reloads + 1 } }),
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

export const MonoverseReloadView = View.make(MonoversePageLive, ({ send }) => (
  <Button
    className="text-muted-foreground/70 hover:text-foreground"
    size="icon-sm"
    variant="ghost"
    aria-label="Reload this project"
    title="Reload this project"
    onClick={() => send({ _tag: 'Reloaded' })}
  >
    <RefreshCwIcon className="size-3.5" />
  </Button>
));
