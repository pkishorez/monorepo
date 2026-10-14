import { Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, History, Runtime } from '../../core/index.ts';
import type { AnyActor, Instance, Running } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import type { ViewOf } from '../../react/index.ts';
import { Route, Router } from '../index.ts';

/*
 * A Router whose places need Inputs: each move waits, pending, while the
 * memory Loading runs the Loaders, and every page starts from its own.
 */

const Summary = Schema.Struct({ slug: Schema.String, title: Schema.String });
const Post = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  body: Schema.String,
});
const Stats = Schema.Struct({ visits: Schema.Number });

const Routes = Route.tree(
  {
    Home: Route.path('/', { metadata: { title: 'Home' } }),
    Blog: Route.path(
      '/blog',
      { input: Schema.Array(Summary), metadata: { title: 'Blog' } },
      {
        Index: Route.path('/'),
        Post: Route.path('/:slug', {
          params: { slug: Schema.String },
          input: Post,
          metadata: (_params, post) => ({ title: post.title }),
        }),
      },
    ),
    Dashboard: Route.path('/dashboard', { render: 'client', input: Stats }),
  },
  { redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) } },
);

const POSTS = [
  { slug: 'hello', title: 'Hello', body: 'Hi.' },
  { slug: 'again', title: 'Again', body: 'Hi again.' },
];

/** How many times each Loader ran, and gates that hold an answer back. */
let calls: Record<string, number> = {};
let gates: Record<string, Promise<void>> = {};
const counted = (name: string) => {
  calls[name] = (calls[name] ?? 0) + 1;
  return Effect.promise(() => gates[name] ?? Promise.resolve());
};

const loaders = Routes.loaders({
  Blog: () =>
    counted('Blog').pipe(
      Effect.as(POSTS.map(({ slug, title }) => ({ slug, title }))),
    ),
  'Blog.Post': ({ slug }) =>
    counted(`Blog.Post:${slug}`).pipe(
      Effect.flatMap(
        (): Effect.Effect<
          typeof Post.Type,
          Route.NotFound | Route.Redirect
        > => {
          if (slug === 'old')
            return Effect.fail(
              Route.redirect(Routes.Blog.Post({ slug: 'hello' })),
            );
          const post = POSTS.find((each) => each.slug === slug);
          return post ? Effect.succeed(post) : Effect.fail(Route.notFound());
        },
      ),
    ),
  Dashboard: (_params, request) =>
    counted('Dashboard').pipe(Effect.as({ visits: request.url.length })),
});

const HomeActor = Actor.make('Home', { props: Routes.Home.props }).build({});
const PostActor = Actor.make('Post', {
  input: Routes.Blog.Post.input,
  props: Routes.Blog.Post.props,
  model: Schema.Struct({ title: Schema.String }),
}).build({ init: (post) => ({ model: { title: post.title } }) });
const IndexActor = Actor.make('Index', {
  props: Routes.Blog.Index.props,
}).build({});
const served = <A extends AnyActor>(actor: A) => ({
  actor,
  view: View.make(actor, () => null) as ViewOf<A>,
});

const posts = Routes.Blog.outlet({
  Index: served(IndexActor),
  Post: served(PostActor),
});
it("checks that each page's Actor starts from its place's Input", () => {
  const Wrong = Actor.make('Wrong', {
    input: Schema.Number,
    props: Routes.Blog.Post.props,
  }).build({ init: () => ({}) });
  const typed = () =>
    Routes.Blog.outlet({
      Index: served(IndexActor),
      // @ts-expect-error a Post is not a number
      Post: served(Wrong),
    });
  expect(typed).toBeTypeOf('function');
});

const BlogActor = Actor.make('Blog', {
  input: Routes.Blog.input,
  props: Routes.Blog.props,
  model: Schema.Struct({ count: Schema.Number }),
}).build({
  init: (list) => ({ model: { count: list.length } }),
  children: posts.children,
});
const DashboardActor = Actor.make('Dashboard', {
  input: Routes.Dashboard.input,
  props: Routes.Dashboard.props,
  model: Stats,
}).build({ init: (stats) => ({ model: stats }) });

const pages = Routes.outlet({
  Home: served(HomeActor),
  Blog: served(BlogActor),
  Dashboard: served(DashboardActor),
});
const AppActor = Actor.make('App', { props: Routes.props }).build({
  children: pages.children,
});
const Root = Router.app(Routes, served(AppActor));
const loading = Router.memory(Routes, loaders);

const settle = Effect.promise(() => new Promise((done) => setTimeout(done, 5)));
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) => {
  calls = {};
  gates = {};
  return Effect.runPromise(Effect.scoped(effect));
};

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];
const find = (app: Running<unknown>, name: string) =>
  walk(app.snapshot()).find((each) => each.actor === name);
const model = (app: Running<unknown>) =>
  app.snapshot().model as {
    readonly entries: ReadonlyArray<{
      readonly route: { readonly _tag: string };
      readonly inputs: Record<string, unknown>;
    }>;
    readonly at: number;
    readonly pending: { readonly to: unknown } | null;
  };
const send = (
  app: Running<unknown>,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) => app.send('Router', message);

describe('a move to places that need Inputs', () => {
  it('waits, pending, on the page shown, then lands with every page started from its Input', () =>
    run(
      Effect.gen(function* () {
        let open!: () => void;
        gates['Blog.Post:hello'] = new Promise((done) => (open = done));
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, {
          _tag: 'Pushed',
          route: Routes.Blog.Post({ slug: 'hello' }),
        });
        yield* settle;
        expect(find(app, 'Home')).toBeDefined();
        expect(model(app).entries).toHaveLength(1);
        expect(model(app).pending?.to).toEqual(
          Routes.Blog.Post({ slug: 'hello' }),
        );
        open();
        yield* settle;
        expect(model(app).pending).toBeNull();
        expect(model(app).entries).toHaveLength(2);
        expect(find(app, 'Blog')!.model).toEqual({ count: 2 });
        expect(find(app, 'Post')!.model).toEqual({ title: 'Hello' });
        expect(calls).toEqual({ Blog: 1, 'Blog.Post:hello': 1 });
      }),
    ));

  it('loads only the places whose key changed: a parent kept keeps its Input', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, {
          _tag: 'Pushed',
          route: Routes.Blog.Post({ slug: 'hello' }),
        });
        yield* settle;
        const blog = find(app, 'Blog')!.id;
        send(app, {
          _tag: 'Pushed',
          route: Routes.Blog.Post({ slug: 'again' }),
        });
        yield* settle;
        send(app, { _tag: 'Pushed', route: Routes.Blog.Index() });
        yield* settle;
        expect(calls).toEqual({
          Blog: 1,
          'Blog.Post:hello': 1,
          'Blog.Post:again': 1,
        });
        expect(find(app, 'Blog')!.id).toBe(blog);
        expect(find(app, 'Index')).toBeDefined();
      }),
    ));

  it('Back and Forward reuse the Inputs each entry holds', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, {
          _tag: 'Pushed',
          route: Routes.Blog.Post({ slug: 'hello' }),
        });
        yield* settle;
        send(app, { _tag: 'Pushed', route: Routes.Home() });
        yield* settle;
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(find(app, 'Post')!.model).toEqual({ title: 'Hello' });
        send(app, { _tag: 'Went', by: 1 });
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(calls).toEqual({ Blog: 1, 'Blog.Post:hello': 1 });
      }),
    ));

  it('drops an older answer once a newer move is under way', () =>
    run(
      Effect.gen(function* () {
        let open!: () => void;
        gates['Blog.Post:hello'] = new Promise((done) => (open = done));
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, {
          _tag: 'Pushed',
          route: Routes.Blog.Post({ slug: 'hello' }),
        });
        yield* settle;
        send(app, {
          _tag: 'Pushed',
          route: Routes.Blog.Post({ slug: 'again' }),
        });
        yield* settle;
        open();
        yield* settle;
        expect(model(app).entries).toHaveLength(2);
        expect(find(app, 'Post')!.model).toEqual({ title: 'Again' });
        // A stale answer, sent by hand, changes nothing.
        const before = model(app);
        send(app, { _tag: 'Loaded', id: 0, inputs: {} });
        yield* settle;
        expect(model(app)).toBe(before);
      }),
    ));

  it('lands on the not-found Route when a Loader says so', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, {
          _tag: 'Pushed',
          route: Routes.Blog.Post({ slug: 'nope' }),
        });
        yield* settle;
        expect(model(app).entries.at(-1)!.route).toEqual({
          _tag: 'NotFound',
          path: '/blog/nope',
        });
      }),
    ));

  it("follows a Loader's Redirect in place of the move, so Back skips it", () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, { _tag: 'Pushed', route: Routes.Blog.Post({ slug: 'old' }) });
        yield* settle;
        expect(model(app).entries.map((entry) => entry.route)).toEqual([
          Routes.Home(),
          Routes.Blog.Post({ slug: 'hello' }),
        ]);
      }),
    ));

  it('a dynamic or client place is handed the request', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, { _tag: 'Pushed', route: Routes.Dashboard() });
        yield* settle;
        expect(find(app, 'Dashboard')!.model).toEqual({
          visits: 'http://memory/'.length,
        });
      }),
    ));

  it('with no Loading, a move lands and a place with an Input is not drawn', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, Layer.empty as never);
        send(app, { _tag: 'Pushed', route: Routes.Blog.Index() });
        yield* settle;
        expect(model(app).entries).toHaveLength(2);
        expect(find(app, 'Blog')).toBeUndefined();
      }),
    ));
});

describe('a Router started from Inputs a server loaded', () => {
  it('draws the places it has Inputs for, and loads the rest once its Runtime starts', () =>
    run(
      Effect.gen(function* () {
        // What a server does, purely: the Router's init at the URL with the
        // Inputs of its server-drawn places, saved as a History of one Restore.
        const input = Root.startAt('/blog/hello', {
          Blog: [{ slug: 'hello', title: 'Hello' }],
        });
        const drawn = History.make(Root.actor, { input }).snapshotAt(null);
        expect(walk(drawn).map((each) => each.actor)).toEqual([
          'Router',
          'App',
          'Blog',
        ]);
        const saved = History.restored(Root.actor, drawn, 0).save();
        const app = yield* Runtime.start(
          History.load(Root.actor, JSON.parse(JSON.stringify(saved))),
          loading,
        );
        yield* settle;
        expect(find(app, 'Post')!.model).toEqual({ title: 'Hello' });
        expect(calls).toEqual({ 'Blog.Post:hello': 1 });
        expect(model(app).entries).toHaveLength(1);
      }),
    ));

  it('a redirect in the Routes reads as the Route it names', () => {
    expect(Root.startAt('/posts/again')).toEqual({
      route: Routes.Blog.Post({ slug: 'again' }),
    });
  });
});

describe('the Metadata', () => {
  it('is worked out from the Inputs, deepest first, and waits for an Input it needs', () => {
    const route = Routes.Blog.Post({ slug: 'hello' });
    expect(Routes.metadata(route)).toEqual({ title: 'Blog' });
    expect(Routes.metadata(route, { 'Blog.Post': POSTS[0] })).toEqual({
      title: 'Hello',
    });
  });
});

describe('a place served by a lazy View', () => {
  const Charts = Route.tree({
    Home: Route.path('/'),
    Chart: Route.path('/chart', { render: 'client', input: Stats }),
  });
  const ChartActor = Actor.make('Chart', {
    input: Charts.Chart.input,
    props: Charts.Chart.props,
    model: Stats,
  }).build({ init: (stats) => ({ model: stats }) });
  const HomeActor = Actor.make('Home', { props: Charts.Home.props }).build({});
  let loaded: Array<string> = [];
  const charts = Charts.outlet({
    Home: served(HomeActor),
    Chart: {
      actor: ChartActor,
      view: View.lazy(async () => {
        loaded.push('Chart');
        return { default: View.make(ChartActor, () => null) };
      }),
    },
  });
  const ChartsActor = Actor.make('Charts', { props: Charts.props }).build({
    children: charts.children,
  });

  it("starts loading its code with its place's Input, not after it", () =>
    run(
      Effect.gen(function* () {
        loaded = [];
        let open!: () => void;
        const answered = new Promise<void>((done) => (open = done));
        const app = yield* Runtime.start(
          Router.app(Charts, served(ChartsActor)).actor,
          Router.memory(
            Charts,
            Charts.loaders({
              Chart: () =>
                Effect.promise(() => answered).pipe(Effect.as({ visits: 3 })),
            }),
          ),
        );
        send(app, { _tag: 'Pushed', route: Charts.Chart() });
        yield* settle;
        expect(model(app).pending?.to).toEqual(Charts.Chart());
        expect(loaded).toEqual(['Chart']);
        open();
        yield* settle;
        expect(find(app, 'Chart')!.model).toEqual({ visits: 3 });
        expect(loaded).toEqual(['Chart']);
      }),
    ));
});
