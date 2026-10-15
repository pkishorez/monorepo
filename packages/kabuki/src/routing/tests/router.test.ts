import { Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { History, Runtime } from '../../core/index.ts';
import type { Instance, Running, Types } from '../../core/index.ts';
import { Loading, Route, Router } from '../index.ts';

/*
 * The Router and the Places, running in memory: each page's data is loaded
 * by the Place around it, the Router holds a move up to its delay, and the
 * Data cache answers Back, preloads and a reload.
 */

const Summary = Schema.Struct({ slug: Schema.String, title: Schema.String });
const PostData = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  body: Schema.String,
});

const Post = Route.page({
  path: '/:slug',
  params: { slug: Schema.String },
  data: PostData,
  model: Schema.Struct({ draft: Schema.NullOr(Schema.String) }),
  message: Schema.TaggedUnion({ Edit: {}, Typed: { text: Schema.String } }),
  metadata: (_, post) => ({ title: post?.title ?? 'A post' }),
}).build({
  init: () => ({ model: { draft: null } }),
  on: {
    Edit: (_, { props }) =>
      props.status._tag === 'Ready'
        ? { model: { draft: props.status.data.body } }
        : {},
    Typed: ({ text }) => ({ model: { draft: text } }),
  },
});
const Blog = Route.page({
  path: '/blog',
  query: { tag: Schema.optionalKey(Schema.String) },
  data: Schema.Array(Summary),
  pages: { Post },
}).build({});
const Home = Route.page({ path: '/', metadata: { title: 'Home' } }).build({});
const Stats = Route.page({
  path: '/stats',
  render: 'client',
  data: Schema.Struct({ visits: Schema.Number }),
}).build({});
const App = Route.page({ pages: { Home, Blog, Stats } }).build({});
const Routes = Route.tree(App, {
  redirect: { '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }) },
});

const POSTS = [
  { slug: 'hello', title: 'Hello', body: 'Hi.' },
  { slug: 'again', title: 'Again', body: 'Hi again.' },
];

/** How many times each Loader ran, gates that hold an answer back, and how the next one ends. */
let calls: Record<string, number> = {};
let gates: Record<string, Promise<void>> = {};
let breaks = new Set<string>();
const counted = (name: string) =>
  Effect.suspend(() => {
    calls[name] = (calls[name] ?? 0) + 1;
    return Effect.promise(() => gates[name] ?? Promise.resolve()).pipe(
      Effect.andThen(
        breaks.has(name) ? Effect.die(new Error(`${name} broke`)) : Effect.void,
      ),
    );
  });
const hold = (name: string) => {
  let open!: () => void;
  gates[name] = new Promise((done) => (open = done));
  return () => {
    delete gates[name];
    open();
  };
};

const loaders = Routes.loaders({
  Blog: ({ tag }) =>
    counted(tag ? `Blog:${tag}` : 'Blog').pipe(
      Effect.as(
        POSTS.filter((post) => !tag || post.slug === tag).map(
          ({ slug, title }) => ({ slug, title }),
        ),
      ),
    ),
  'Blog.Post': ({ slug }) =>
    counted(`Blog.Post:${slug}`).pipe(
      Effect.flatMap(
        (): Effect.Effect<
          typeof PostData.Type,
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
  Stats: () => counted('Stats').pipe(Effect.as({ visits: 3 })),
});

const AppView = Route.view(App, () => null);
const Root = Router.app(Routes, AppView);
const loading = Router.cached(Routes, Router.memory(Routes, loaders));

const wait = (ms: number) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));
const settle = wait(10);
const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) => {
  calls = {};
  gates = {};
  breaks = new Set();
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
/** What the page `name` is handed as `status`. */
const status = (app: Running<unknown>, name: string) =>
  (find(app, name)?.props as { readonly status?: unknown } | undefined)?.status;
const router = (app: Running<unknown>) =>
  app.snapshot().model as {
    readonly entries: ReadonlyArray<{ readonly route: unknown }>;
    readonly at: number;
    readonly pending: { readonly to: unknown } | null;
  };
const send = (
  app: Running<unknown>,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) => app.send('Router', message);
const push = (app: Running<unknown>, route: unknown) =>
  send(app, { _tag: 'Pushed', route });

const ready = (data: unknown, refreshing = false) => ({
  _tag: 'Ready',
  data,
  refreshing,
});
const BLOG = POSTS.map(({ slug, title }) => ({ slug, title }));

describe('a move to pages with data', () => {
  it('waits on the page shown while it loads, then lands with every page Ready', () =>
    run(
      Effect.gen(function* () {
        const open = hold('Blog.Post:hello');
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        expect(find(app, 'Home')).toBeDefined();
        expect(router(app).pending?.to).toEqual(
          Routes.Blog.Post({ slug: 'hello' }),
        );
        open();
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Blog')).toEqual(ready(BLOG));
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
        // Parent and child were asked for together.
        expect(calls).toEqual({ Blog: 1, 'Blog.Post:hello': 1 });
      }),
    ));

  it('lands after its delay without the data, each page Loading, then Ready', () =>
    run(
      Effect.gen(function* () {
        const open = hold('Blog.Post:hello');
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* wait(200);
        expect(router(app).pending).toBeNull();
        // Parent and child each load on their own: the Blog is Ready while the post still loads.
        expect(status(app, 'Post')).toEqual({ _tag: 'Loading' });
        open();
        yield* wait(350);
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
        // The Places joined the load the Router started: nothing ran twice.
        expect(calls['Blog.Post:hello']).toBe(1);
      }),
    ));

  it('loads parent and child side by side: the quicker shows first, never waiting on the other', () =>
    run(
      Effect.gen(function* () {
        const open = hold('Blog');
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* wait(500);
        expect(status(app, 'Blog')).toEqual({ _tag: 'Loading' });
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
        open();
        yield* settle;
        expect(status(app, 'Blog')).toEqual(ready(BLOG));
        expect(calls).toEqual({ Blog: 1, 'Blog.Post:hello': 1 });
      }),
    ));

  it('keeps a page whose params did not change, with its own Model', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        const blog = find(app, 'Blog')!.id;
        app.send(find(app, 'Post')!.id, { _tag: 'Typed', text: 'mine' });
        push(app, Routes.Blog.Post({ slug: 'again' }));
        yield* settle;
        expect(find(app, 'Blog')!.id).toBe(blog);
        // New params, a new page: its Model starts again.
        expect(find(app, 'Post')!.model).toEqual({ draft: null });
        expect(calls).toEqual({
          Blog: 1,
          'Blog.Post:hello': 1,
          'Blog.Post:again': 1,
        });
      }),
    ));

  it('loads a page again when the query its Loader reads changes, the data shown meanwhile', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog());
        yield* settle;
        const blog = find(app, 'Blog')!.id;
        const open = hold('Blog:again');
        push(app, Routes.Blog({ tag: 'again' }));
        yield* settle;
        expect(find(app, 'Blog')!.id).toBe(blog);
        expect(status(app, 'Blog')).toEqual(ready(BLOG, true));
        open();
        yield* settle;
        expect(status(app, 'Blog')).toEqual(ready([BLOG[1]]));
      }),
    ));
});

describe('a Loader that does not answer with data', () => {
  it('fails its own page alone; a link to it again retries', () =>
    run(
      Effect.gen(function* () {
        breaks.add('Blog.Post:hello');
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        expect(status(app, 'Blog')).toEqual(ready(BLOG));
        expect(status(app, 'Post')).toEqual({
          _tag: 'Failed',
          reason: 'Blog.Post:hello broke',
          notFound: false,
        });
        breaks.clear();
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* wait(350);
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
      }),
    ));

  it('says not found on its page', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'nope' }));
        yield* settle;
        expect(status(app, 'Post')).toEqual({
          _tag: 'Failed',
          reason: 'Not found',
          notFound: true,
        });
      }),
    ));

  it('Redirects: the move goes on to where it says', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'old' }));
        yield* settle;
        const { entries, at } = router(app);
        expect(entries[at]!.route).toEqual(Routes.Blog.Post({ slug: 'hello' }));
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
      }),
    ));
});

describe('the Data cache', () => {
  it('answers Back at once, and loads it again behind the data shown', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        push(app, Routes.Home());
        yield* settle;
        const open = hold('Blog.Post:hello');
        hold('Blog');
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        // Static places are never loaded again; this one is static too, so
        // it is Ready from its copy, with nothing to wait on.
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
        open();
        expect(calls['Blog.Post:hello']).toBe(1);
      }),
    ));

  it('keeps what a server drew the page with: Back to it is at once, and loads nothing', () =>
    run(
      Effect.gen(function* () {
        const input = Root.startAt('/blog/hello', {
          Blog: { _tag: 'Ready', data: BLOG, stale: false },
          'Blog.Post': { _tag: 'Ready', data: POSTS[0], stale: false },
        });
        const app = yield* Runtime.start(
          History.make(Root.actor, { input }),
          loading,
        );
        yield* settle;
        push(app, Routes.Home());
        yield* settle;
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
        expect(calls).toEqual({});
      }),
    ));

  it('shows a dynamic or client page from its copy at once, Ready and refreshing, then fresh', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Stats());
        yield* settle;
        push(app, Routes.Home());
        yield* settle;
        const open = hold('Stats');
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Stats')).toEqual(ready({ visits: 3 }, true));
        open();
        yield* settle;
        expect(status(app, 'Stats')).toEqual(ready({ visits: 3 }));
        expect(calls['Stats']).toBe(2);
      }),
    ));

  it('a preload warms it: the move then needs no Loader', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, {
          _tag: 'Preloading',
          route: Routes.Blog.Post({ slug: 'again' }),
        });
        yield* settle;
        expect(calls).toEqual({ Blog: 1, 'Blog.Post:again': 1 });
        // The page shown did not move.
        expect(find(app, 'Home')).toBeDefined();
        push(app, Routes.Blog.Post({ slug: 'again' }));
        yield* settle;
        expect(status(app, 'Post')).toEqual(ready(POSTS[1]));
        expect(calls).toEqual({ Blog: 1, 'Blog.Post:again': 1 });
      }),
    ));

  it('a move during a preload joins it', () =>
    run(
      Effect.gen(function* () {
        const open = hold('Blog.Post:again');
        const app = yield* Runtime.start(Root.actor, loading);
        send(app, {
          _tag: 'Preloading',
          route: Routes.Blog.Post({ slug: 'again' }),
        });
        yield* settle;
        push(app, Routes.Blog.Post({ slug: 'again' }));
        yield* settle;
        open();
        yield* settle;
        expect(status(app, 'Post')).toEqual(ready(POSTS[1]));
        expect(calls['Blog.Post:again']).toBe(1);
      }),
    ));
});

describe('a held Back', () => {
  it('moves the history at once, so a second Back and a push start from where it goes', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        push(app, Routes.Blog.Post({ slug: 'again' }));
        yield* settle;
        push(app, Routes.Home());
        yield* settle;
        // Nothing kept: every Back now waits on its Loaders.
        send(app, { _tag: 'Reloaded' });
        yield* settle;
        hold('Blog');
        hold('Blog.Post:again');
        hold('Blog.Post:hello');
        send(app, { _tag: 'Went', by: -1 });
        send(app, { _tag: 'Went', by: -1 });
        expect(router(app).at).toBe(1);
        // The page shown stays drawn while the move is held.
        expect(find(app, 'Home')).toBeDefined();
        push(app, Routes.Stats());
        yield* settle;
        const { entries, at } = router(app);
        expect(
          entries.map(({ route }) => (route as { _tag: string })._tag),
        ).toEqual(['Home', 'Blog', 'Stats']);
        expect(at).toBe(2);
      }),
    ));
});

describe('a reload', () => {
  it('loads every page on screen again, its data and its own Model kept meanwhile', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        const post = find(app, 'Post')!.id;
        app.send(post, { _tag: 'Typed', text: 'mine' });
        const open = hold('Blog.Post:hello');
        send(app, { _tag: 'Reloaded' });
        yield* settle;
        expect(status(app, 'Post')).toEqual(ready(POSTS[0], true));
        open();
        yield* settle;
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
        expect(find(app, 'Post')!.id).toBe(post);
        expect(find(app, 'Post')!.model).toEqual({ draft: 'mine' });
        expect(calls).toEqual({ Blog: 2, 'Blog.Post:hello': 2 });
      }),
    ));
});

describe('a copy that comes while a page loads', () => {
  it('shows it, refreshing, then loads it again fresh', () =>
    run(
      Effect.gen(function* () {
        let fresh = 0;
        const stale = Layer.succeed(Loading, {
          load: (places, options) =>
            Effect.sync(() => {
              if (options?.fresh) fresh += 1;
              return Object.fromEntries(
                places.map(({ name }) => [
                  name,
                  options?.fresh
                    ? { _tag: 'Loaded' as const, data: { visits: 2 } }
                    : {
                        _tag: 'Loaded' as const,
                        data: { visits: 1 },
                        stale: true,
                      },
                ]),
              );
            }),
        });
        const app = yield* Runtime.start(
          History.make(Root.actor, { input: Root.startAt('/stats') }),
          stale,
        );
        yield* wait(400);
        expect(status(app, 'Stats')).toEqual(ready({ visits: 2 }));
        expect(fresh).toBe(1);
      }),
    ));
});

describe('two reloads in a row', () => {
  it('show the data the last one loaded, never an older answer', () =>
    run(
      Effect.gen(function* () {
        let version = 0;
        const counting = Router.cached(
          Routes,
          Router.memory(
            Routes,
            Routes.loaders({
              ...loaders,
              Stats: () =>
                Effect.sync(() => (version += 1)).pipe(
                  Effect.flatMap((visits) =>
                    Effect.as(Effect.sleep(visits === 2 ? 60 : 10), {
                      visits,
                    }),
                  ),
                ),
            }),
          ),
        );
        const app = yield* Runtime.start(Root.actor, counting);
        push(app, Routes.Stats());
        yield* wait(60);
        expect(status(app, 'Stats')).toEqual(ready({ visits: 1 }));
        send(app, { _tag: 'Reloaded' });
        yield* wait(5);
        send(app, { _tag: 'Reloaded' });
        yield* wait(150);
        expect(status(app, 'Stats')).toEqual(ready({ visits: 3 }));
      }),
    ));
});

describe('a client page', () => {
  it('starts Loading when the app opens at it, and loads once it runs', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(
          History.make(Root.actor, { input: Root.startAt('/stats') }),
          loading,
        );
        yield* wait(350);
        expect(status(app, 'Stats')).toEqual(ready({ visits: 3 }));
      }),
    ));
});

describe('the not-found Route', () => {
  it('is handed to the root page as its path', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.read('/nowhere').route);
        yield* settle;
        const props = find(app, 'App')!.props as {
          readonly route: { readonly notFound: string | null };
        };
        expect(props.route.notFound).toBe('/nowhere');
      }),
    ));
});

it('types a page: its Props, its pages and its data', () => {
  const probe = (props: Types<typeof Post.actor>['props']) => {
    const { status: now } = props;
    // @ts-expect-error the data is there only once Ready
    void now.data;
    return now._tag === 'Ready' ? now.data.title : props.params.slug;
  };
  expect(probe).toBeTypeOf('function');
});

describe('a drawing a server saves', () => {
  it('restores in the browser as it was, through JSON: every page as it started', () => {
    const input = Root.startAt('/blog/hello', {
      Blog: { _tag: 'Ready', data: BLOG, stale: false },
      'Blog.Post': { _tag: 'Failed', reason: 'gone', notFound: true },
    });
    const history = History.make(Root.actor, { input });
    const saved = History.restored(
      Root.actor,
      history.snapshotAt(null),
      0,
    ).save();
    const loaded = History.load(Root.actor, JSON.parse(JSON.stringify(saved)));
    // Right after its one entry, the Restore.
    expect(loaded.snapshotAt(0)).toEqual(history.snapshotAt(null));
    const tree = loaded.snapshotAt(0) as Instance;
    const post = walk(tree).find((each) => each.actor === 'Post')!;
    expect((post.props as { readonly status: unknown }).status).toEqual({
      _tag: 'Failed',
      reason: 'gone',
      notFound: true,
    });
  });
});
