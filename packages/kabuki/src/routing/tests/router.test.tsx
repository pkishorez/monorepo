import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Runtime } from '../../core/index.ts';
import type { Instance, Running } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import { Navigation, Route, Router } from '../index.ts';

/*
 * The router in memory: no Adapter, so every move is a Message and nothing
 * else. These run the real Runtime.
 */

const Routes = Route.tree({
  Dashboard: Route.path('/'),
  Projects: Route.path(
    '/projects',
    {},
    {
      List: Route.path('/', {
        query: { q: Schema.optionalKey(Schema.String) },
      }),
      Project: Route.path('/:id', { params: { id: Schema.FiniteFromString } }),
    },
  ),
  Settings: Route.path(
    '/settings',
    {},
    {
      Profile: Route.path('/'),
      Billing: Route.path('/billing'),
    },
  ),
});

const page = <const Name extends string, P>(
  name: Name,
  props: Schema.Codec<P, unknown, never, never>,
) => {
  const actor = Actor.make(name, { props }).build({});
  return { actor, view: View.make(actor, () => null) };
};

const Dashboard = page('Dashboard', Routes.Dashboard.props);
const List = page('List', Routes.Projects.List.props);
const Profile = page('Profile', Routes.Settings.Profile.props);
const Billing = page('Billing', Routes.Settings.Billing.props);

/** A project page that can move the app itself, from an Update. */
const ProjectActor = Actor.make('Project', {
  requires: [Navigation],
  props: Routes.Projects.Project.props,
  message: Schema.TaggedUnion({ Next: {}, Closed: {} }),
}).build({
  on: {
    Next: (_, { props }) => ({
      command: Router.push(Routes.Projects.Project({ id: props.id + 1 })),
    }),
    Closed: () => ({ command: Router.backTo(Routes.Projects.List()) }),
  },
});
const Project = {
  actor: ProjectActor,
  view: View.make(ProjectActor, () => null),
};

const projects = Routes.Projects.outlet({ List, Project });
const ProjectsActor = Actor.make('Projects', {
  props: Routes.Projects.props,
  model: Schema.Struct({ opened: Schema.Number }),
}).build({
  init: () => ({ model: { opened: 0 } }),
  children: projects.children,
});
const Projects = {
  actor: ProjectsActor,
  view: View.make(ProjectsActor, () => null),
};

const sections = Routes.Settings.outlet({ Profile, Billing });
const SettingsActor = Actor.make('Settings', {
  props: Routes.Settings.props,
}).build({
  children: sections.children,
});
const Settings = {
  actor: SettingsActor,
  view: View.make(SettingsActor, () => null),
};

const pages = Routes.outlet({ Dashboard, Projects, Settings });
const AppActor = Actor.make('App', { props: Routes.props }).build({
  children: pages.children,
});
const App = { actor: AppActor, view: View.make(AppActor, () => null) };

const Root = Router.app(Routes, App);

const settle = Effect.gen(function* () {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow;
});
const run = <A,>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

/** The pages that exist, from the root down: one per level. */
const shown = (app: Running<unknown>): ReadonlyArray<string> => {
  const names: Array<string> = [];
  let at: Instance | undefined = app.snapshot();
  while (at) {
    names.push(at.actor);
    const next: Instance | undefined = Object.values(at.children)
      .flatMap(
        (child) => (Array.isArray(child) ? child : [child]) as Array<Instance>,
      )
      .at(0);
    at = next;
  }
  return names.slice(1);
};

/** The Instance with this Actor's name, anywhere in the tree. */
const find = (app: Running<unknown>, name: string): Instance | undefined => {
  const walk = (at: Instance): Instance | undefined =>
    at.actor === name
      ? at
      : Object.values(at.children)
          .flatMap(
            (child) =>
              (Array.isArray(child) ? child : [child]) as Array<Instance>,
          )
          .map(walk)
          .find(Boolean);
  return walk(app.snapshot());
};

const model = (app: Running<unknown>) =>
  app.snapshot().model as {
    readonly entries: ReadonlyArray<{ readonly route: unknown }>;
    readonly at: number;
    readonly move: { readonly how: string };
  };

const started = Runtime.start(Root.actor);
const send = (
  app: Running<unknown>,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) => app.send('Router', message);

describe('the router in memory', () => {
  it('starts at /, and each level shows the page its part of the Route names', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        expect(shown(app)).toEqual(['App', 'Dashboard']);
        send(app, { _tag: 'Pushed', route: Routes.Settings.Billing() });
        yield* settle;
        expect(shown(app)).toEqual(['App', 'Settings', 'Billing']);
      }),
    ));

  it('one move is one Message, however deep', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        const before = app.history.branch().length;
        send(app, { _tag: 'Pushed', route: Routes.Settings.Billing() });
        yield* settle;
        expect(app.history.branch().length - before).toBe(1);
      }),
    ));

  it('keeps a page whose part of the Route did not change', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        send(app, { _tag: 'Pushed', route: Routes.Settings.Profile() });
        yield* settle;
        const settings = find(app, 'Settings')!.id;
        send(app, { _tag: 'Pushed', route: Routes.Settings.Billing() });
        yield* settle;
        expect(find(app, 'Settings')!.id).toBe(settings);
        expect(find(app, 'Profile')).toBeUndefined();
      }),
    ));

  it('new params are a fresh page; a new query is not', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        send(app, {
          _tag: 'Pushed',
          route: Routes.Projects.Project({ id: 1 }),
        });
        yield* settle;
        const one = find(app, 'Project')!.id;
        send(app, {
          _tag: 'Pushed',
          route: Routes.Projects.Project({ id: 2 }),
        });
        yield* settle;
        expect(find(app, 'Project')!.id).not.toBe(one);
        expect(find(app, 'Project')!.props).toEqual({ id: 2 });

        send(app, { _tag: 'Pushed', route: Routes.Projects.List({ q: 'a' }) });
        yield* settle;
        const list = find(app, 'List')!.id;
        send(app, {
          _tag: 'Replaced',
          route: Routes.Projects.List({ q: 'ab' }),
        });
        yield* settle;
        expect(find(app, 'List')!.id).toBe(list);
        expect(find(app, 'List')!.props).toEqual({ q: 'ab' });
      }),
    ));

  it('keeps the history: push, back, forward, and a push that drops what was ahead', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        send(app, { _tag: 'Pushed', route: Routes.Settings.Profile() });
        send(app, { _tag: 'Pushed', route: Routes.Settings.Billing() });
        yield* settle;
        expect(model(app).entries).toHaveLength(3);
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(shown(app)).toEqual(['App', 'Settings', 'Profile']);
        expect(model(app).move.how).toBe('back');
        send(app, { _tag: 'Went', by: 1 });
        yield* settle;
        expect(shown(app)).toEqual(['App', 'Settings', 'Billing']);
        send(app, { _tag: 'Went', by: -2 });
        send(app, { _tag: 'Pushed', route: Routes.Projects.List() });
        yield* settle;
        expect(model(app).entries).toHaveLength(2);
        expect(model(app).at).toBe(1);
      }),
    ));

  it('a push to where the app already is changes nothing', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        const before = model(app);
        send(app, { _tag: 'Pushed', route: Routes.Dashboard() });
        yield* settle;
        expect(model(app)).toBe(before);
      }),
    ));

  it('a page moves the app from an Update, through Navigation', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        send(app, {
          _tag: 'Pushed',
          route: Routes.Projects.Project({ id: 1 }),
        });
        yield* settle;
        app.send(find(app, 'Project')!.id, { _tag: 'Next' });
        yield* settle;
        expect(find(app, 'Project')!.props).toEqual({ id: 2 });
        expect(model(app).entries).toHaveLength(3);
      }),
    ));

  it('backTo goes Back when the app came from there, and replaces otherwise', () =>
    run(
      Effect.gen(function* () {
        const app = yield* started;
        send(app, { _tag: 'Pushed', route: Routes.Projects.List() });
        send(app, {
          _tag: 'Pushed',
          route: Routes.Projects.Project({ id: 1 }),
        });
        yield* settle;
        app.send(find(app, 'Project')!.id, { _tag: 'Closed' });
        yield* settle;
        expect(model(app).at).toBe(1);
        expect(model(app).entries).toHaveLength(3);

        send(app, {
          _tag: 'Replaced',
          route: Routes.Projects.Project({ id: 5 }),
        });
        yield* settle;
        app.send(find(app, 'Project')!.id, { _tag: 'Closed' });
        yield* settle;
        expect(shown(app)).toEqual(['App', 'Projects', 'List']);
        expect(model(app).move.how).toBe('replace');
      }),
    ));
});
