import { Effect, Layer, Schema } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Command, History, Runtime } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import { Navigation, Page, Router } from '../index.ts';
import { Loading } from '../capabilities/index.ts';
import type { Running } from '../../core/runtime/index.ts';
import type { Types } from '../../core/actor/index.ts';
import type { Instance } from '../../core/snapshot/index.ts';
import { Adapter } from '../router/adapter/index.ts';
import type { NotFoundError, RedirectTo } from '../page/index.ts';

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

const Post = Page.define({
  path: '/:slug',
  params: { slug: Schema.String },
  data: PostData,
  model: Schema.Struct({ draft: Schema.NullOr(Schema.String) }),
  message: Schema.TaggedUnion({ Edit: {}, Typed: { text: Schema.String } }),
  metadata: (_, post) => ({ title: post?.title ?? 'A post' }),
});
const PostLive = Page.build(Post, {
  init: () => ({ model: { draft: null } }),
  on: {
    Edit: (_, { props }) =>
      props.status._tag === 'Ready'
        ? { model: { draft: props.status.data.body } }
        : {},
    Typed: ({ text }) => ({ model: { draft: text } }),
  },
});
const Blog = Page.define({
  path: '/blog',
  query: { tag: Schema.optionalKey(Schema.String) },
  data: Schema.Array(Summary),
  pages: { Post },
});
const BlogLive = Page.build(Blog, { pages: { Post: PostLive } });
const Home = Page.define({ path: '/', metadata: { title: 'Home' } });
const Stats = Page.define({
  path: '/stats',
  render: 'client',
  data: Schema.Struct({ visits: Schema.Number }),
});
const App = Page.define({ pages: { Home, Blog, Stats } });
const AppLive = Page.build(App, {
  pages: { Home: Page.build(Home), Blog: BlogLive, Stats: Page.build(Stats) },
});
const Routes = Router.define(App, {
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
        (): Effect.Effect<typeof PostData.Type, NotFoundError | RedirectTo> => {
          if (slug === 'old')
            return Effect.fail(
              Page.redirect(Routes.Blog.Post({ slug: 'hello' })),
            );
          if (slug === 'away')
            return Effect.fail(Page.redirect('https://example.com/away'));
          const post = POSTS.find((each) => each.slug === slug);
          return post ? Effect.succeed(post) : Effect.fail(Page.notFound());
        },
      ),
    ),
  Stats: () => counted('Stats').pipe(Effect.as({ visits: 3 })),
});

const AppView = View.make(AppLive, () => null);
const Root = Router.app(Routes, AppView);
const loading = Loading.cached(Routes, Loading.memory(Routes, loaders));

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

/** What a server drew a place with: `data`, loaded as the page was drawn. */
const served = (data: unknown) => ({
  _tag: 'Ready' as const,
  data,
  stale: false,
  from: 'server' as const,
  at: Date.now(),
  took: 5,
});
/** A Ready status with `data`, whenever it goes stale. */
const ready = (data: unknown, refreshing = false) =>
  expect.objectContaining({ _tag: 'Ready', data, refreshing });
/** When the page `name`'s data goes stale. */
const freshUntil = (app: Running<unknown>, name: string) =>
  (
    status(app, name) as
      | { readonly info?: { readonly freshUntil?: number | null } }
      | undefined
  )?.info?.freshUntil;
/** Where the page `name`'s data came from, and how long it took. */
const from = (app: Running<unknown>, name: string) => {
  const info = (
    status(app, name) as
      | { readonly info?: { readonly from?: string; readonly took?: unknown } }
      | undefined
  )?.info;
  return { from: info?.from, took: info?.took };
};
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
        expect(status(app, 'Post')).toEqual({
          _tag: 'Loading',
          info: { render: 'static', staleTime: null },
        });
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
        expect(status(app, 'Blog')).toEqual({
          _tag: 'Loading',
          info: { render: 'static', staleTime: null },
        });
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
          info: { render: 'static', staleTime: null },
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
          info: { render: 'static', staleTime: null },
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

describe('a Redirect out of the app', () => {
  /** An Adapter at `/` that keeps every URL it is asked to leave for. */
  const away = () => {
    const left: Array<readonly [string, unknown]> = [];
    const layer = Layer.succeed(Adapter, {
      url: () => '/',
      key: () => null,
      listen: () => () => {},
      push: () => {},
      replace: () => {},
      go: () => {},
      leave: (url, options) => void left.push([url, options]),
    });
    return { left, layer };
  };

  it('leaves for its URL in place of the entry, and drops the move', () =>
    run(
      Effect.gen(function* () {
        const { left, layer } = away();
        const app = yield* Runtime.start(
          Root.actor,
          Layer.merge(loading, layer),
        );
        yield* settle;
        push(app, Routes.Blog.Post({ slug: 'away' }));
        yield* settle;
        expect(left).toEqual([['https://example.com/away', { replace: true }]]);
        expect(router(app).pending).toBeNull();
        const { entries, at } = router(app);
        expect(entries[at]!.route).toEqual(Routes.Home());
      }),
    ));

  it('in memory, drops the move and leaves nothing', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'away' }));
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(router(app).entries).toHaveLength(1);
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
        // A static page is fresh until the next deploy.
        expect(freshUntil(app, 'Post')).toBeNull();
        open();
        expect(calls['Blog.Post:hello']).toBe(1);
      }),
    ));

  it('keeps what a server drew the page with: Back to it is at once, and loads nothing', () =>
    run(
      Effect.gen(function* () {
        const input = Root.startAt('/blog/hello', {
          Blog: served(BLOG),
          'Blog.Post': served(POSTS[0]),
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
        // A copy of what the server drew it with, from the Data cache now.
        expect(from(app, 'Post')).toEqual({ from: 'cache', took: null });
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

  it('keeps what it loaded in the Data cache: Back to it after is at once', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        send(app, { _tag: 'Reloaded' });
        yield* settle;
        push(app, Routes.Home());
        yield* settle;
        hold('Blog.Post:hello');
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Post')).toEqual(ready(POSTS[0]));
        expect(calls['Blog.Post:hello']).toBe(2);
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
              const again = options?.fresh || options?.again;
              if (again) fresh += 1;
              return Object.fromEntries(
                places.map(({ name }) => [
                  name,
                  again
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
        const counting = Loading.cached(
          Routes,
          Loading.memory(
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

describe('a Fork, the app started again from an earlier Step', () => {
  /** A browser's history in memory: its entries, and the one shown. */
  const browser = (url: string) => {
    const entries: Array<{ url: string; key: string | null }> = [
      { url, key: null },
    ];
    let at = 0;
    const heard = new Set<() => void>();
    const tell = () => heard.forEach((changed) => changed());
    const layer = Layer.succeed(Adapter, {
      url: () => entries[at]!.url,
      key: () => entries[at]!.key,
      listen: (changed) => {
        heard.add(changed);
        return () => heard.delete(changed);
      },
      push: (url, key) => {
        entries.splice(at + 1, Infinity, { url, key });
        at++;
        tell();
      },
      replace: (url, key) => {
        entries[at] = { url, key };
        tell();
      },
      go: (by) => {
        at = Math.min(Math.max(at + by, 0), entries.length - 1);
        tell();
      },
      leave: () => {},
    });
    return { layer, shown: () => entries[at]!, count: () => entries.length };
  };
  const current = (app: Running<unknown>) => {
    const model = app.snapshot().model as {
      readonly entries: ReadonlyArray<{ readonly key: string; route: unknown }>;
      readonly at: number;
    };
    return model.entries[model.at]!;
  };

  it("carries on at the Step's own page, and puts the address there", () =>
    run(
      Effect.gen(function* () {
        const address = browser('/');
        const app = yield* Runtime.start(
          History.make(Root.actor),
          Layer.merge(loading, address.layer),
        );
        yield* settle;
        push(app, Routes.Blog());
        yield* settle;
        const onBlog = app.history.head()!;
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        expect(address.shown().url).toBe('/blog/hello');

        yield* app.start(onBlog);
        yield* settle;
        expect(current(app).route).toEqual(Routes.Blog());
        expect(address.shown()).toEqual({
          url: '/blog',
          key: current(app).key,
        });
      }),
    ));

  it('goes to the entry the address kept for it, when the Step had one', () =>
    run(
      Effect.gen(function* () {
        const address = browser('/');
        const app = yield* Runtime.start(
          History.make(Root.actor),
          Layer.merge(loading, address.layer),
        );
        yield* settle;
        push(app, Routes.Blog());
        yield* settle;
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        const backOnBlog = app.history.head()!;
        send(app, { _tag: 'Went', by: 1 });
        yield* settle;
        expect(address.shown().url).toBe('/blog/hello');

        yield* app.start(backOnBlog);
        yield* settle;
        expect(current(app).route).toEqual(Routes.Blog());
        expect(address.shown()).toEqual({
          url: '/blog',
          key: current(app).key,
        });
        // Back on the entry it kept, not a copy written over the one after.
        expect(address.count()).toBe(3);
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
  const probe = (props: Types<typeof PostLive>['props']) => {
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
      Blog: served(BLOG),
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
      info: { render: 'static', staleTime: null },
    });
  });
});

describe('a page with a Stale time', () => {
  const Feed = Page.define({
    path: '/feed',
    render: 'dynamic',
    staleTime: 80,
    data: Schema.Struct({ items: Schema.Number }),
  });
  const Start = Page.define({ path: '/' });
  const Shell = Page.define({ pages: { Start, Feed } });
  const Fresh = Router.define(Shell);
  const FreshRoot = Router.app(
    Fresh,
    View.make(
      Page.build(Shell, {
        pages: { Start: Page.build(Start), Feed: Page.build(Feed) },
      }),
      () => null,
    ),
  );
  const fresh = Loading.cached(
    Fresh,
    Loading.memory(
      Fresh,
      Fresh.loaders({
        Feed: () => counted('Feed').pipe(Effect.as({ items: 2 })),
      }),
    ),
  );
  const FEED = { items: 2 };

  it('shows a fresh copy and loads nothing', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(FreshRoot.actor, fresh);
        push(app, Fresh.Feed());
        yield* settle;
        push(app, Fresh.Start());
        yield* settle;
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Feed')).toEqual(ready(FEED));
        expect(calls).toEqual({ Feed: 1 });
      }),
    ));

  it('shows an older copy at once, refreshing, and loads it again behind it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(FreshRoot.actor, fresh);
        push(app, Fresh.Feed());
        yield* settle;
        push(app, Fresh.Start());
        yield* wait(100);
        const open = hold('Feed');
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Feed')).toEqual(ready(FEED, true));
        open();
        yield* settle;
        expect(status(app, 'Feed')).toEqual(ready(FEED));
        expect(calls).toEqual({ Feed: 2 });
      }),
    ));

  it('a preload skips a fresh copy, loads an older one again, and the move after it loads nothing', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(FreshRoot.actor, fresh);
        send(app, { _tag: 'Preloading', route: Fresh.Feed() });
        yield* settle;
        send(app, { _tag: 'Preloading', route: Fresh.Feed() });
        yield* settle;
        expect(calls).toEqual({ Feed: 1 });
        yield* wait(100);
        send(app, { _tag: 'Preloading', route: Fresh.Feed() });
        yield* settle;
        expect(calls).toEqual({ Feed: 2 });
        push(app, Fresh.Feed());
        yield* settle;
        expect(status(app, 'Feed')).toEqual(ready(FEED));
        expect(calls).toEqual({ Feed: 2 });
      }),
    ));

  it('a move to an older copy during a preload of it joins the preload: one load', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(FreshRoot.actor, fresh);
        push(app, Fresh.Feed());
        yield* settle;
        push(app, Fresh.Start());
        yield* wait(100);
        const open = hold('Feed');
        send(app, { _tag: 'Preloading', route: Fresh.Feed() });
        yield* settle;
        push(app, Fresh.Feed());
        yield* settle;
        expect(status(app, 'Feed')).toEqual(ready(FEED, true));
        open();
        yield* settle;
        expect(status(app, 'Feed')).toEqual(ready(FEED));
        expect(calls).toEqual({ Feed: 2 });
      }),
    ));

  it('says when its data goes stale: its Stale time from when it arrived, kept on a copy', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(FreshRoot.actor, fresh);
        const before = Date.now();
        push(app, Fresh.Feed());
        yield* settle;
        const until = freshUntil(app, 'Feed') as number;
        expect(until).toBeGreaterThanOrEqual(before + 80);
        expect(until).toBeLessThanOrEqual(Date.now() + 80);
        push(app, Fresh.Start());
        yield* settle;
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        // The copy is the same data: it goes stale when it did.
        expect(freshUntil(app, 'Feed')).toBe(until);
        push(app, Fresh.Start());
        yield* wait(100);
        send(app, { _tag: 'Went', by: -1 });
        yield* wait(150);
        // Loaded again: fresh from when the new data arrived.
        expect(freshUntil(app, 'Feed')).toBeGreaterThan(until);
      }),
    ));

  it('says where its data came from, and how long it took: in `info`', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(FreshRoot.actor, fresh);
        const open = hold('Feed');
        push(app, Fresh.Feed());
        yield* wait(200);
        expect(status(app, 'Feed')).toEqual({
          _tag: 'Loading',
          info: { render: 'dynamic', staleTime: 80 },
        });
        open();
        // It landed after its delay; its loading screen stays 300 ms.
        yield* wait(400);
        const loaded = from(app, 'Feed');
        expect(loaded.from).toBe('browser');
        expect(loaded.took).toBeGreaterThanOrEqual(0);
        push(app, Fresh.Start());
        yield* settle;
        // Stale by now: shown from its copy while it loads again.
        hold('Feed');
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(status(app, 'Feed')).toEqual(ready(FEED, true));
        expect(from(app, 'Feed')).toEqual({ from: 'cache', took: null });
      }),
    ));

  it('a reload loads it again, fresh or not', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(FreshRoot.actor, fresh);
        push(app, Fresh.Feed());
        yield* settle;
        send(app, { _tag: 'Reloaded' });
        yield* settle;
        expect(calls).toEqual({ Feed: 2 });
      }),
    ));
});

describe("the router's cacheSize", () => {
  it('is how many copies the Data cache keeps: the least recently used goes', () =>
    run(
      Effect.gen(function* () {
        const Small = Router.define(App, { cacheSize: 1 });
        const app = yield* Runtime.start(
          Router.app(Small, AppView).actor,
          Loading.cached(Small, Loading.memory(Small, loaders)),
        );
        push(app, Small.Blog.Post({ slug: 'hello' }));
        yield* settle;
        push(app, Small.Blog.Post({ slug: 'again' }));
        yield* settle;
        hold('Blog.Post:hello');
        send(app, { _tag: 'Went', by: -1 });
        yield* settle;
        // Its copy was dropped for the newer one: Back waits on its Loader.
        expect(router(app).pending).not.toBeNull();
        expect(calls['Blog.Post:hello']).toBe(2);
        expect(Routes.options.cacheSize).toBe(50);
      }),
    ));
});

/** A Ready status with `data` that did, or did not, take the place of a loading screen. */
const arrived = (data: unknown, waited: boolean) =>
  expect.objectContaining({ _tag: 'Ready', data, refreshing: false, waited });
const LOADING_POST = {
  _tag: 'Loading',
  info: { render: 'static', staleTime: null },
};

describe("a Ready status's waited", () => {
  it('is false for data that came while the move was held', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        expect(status(app, 'Post')).toEqual(arrived(POSTS[0], false));
      }),
    ));

  it('is true for data that took the place of a loading screen', () =>
    run(
      Effect.gen(function* () {
        const open = hold('Blog.Post:hello');
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* wait(200);
        expect(status(app, 'Post')).toEqual(LOADING_POST);
        open();
        yield* wait(350);
        expect(status(app, 'Post')).toEqual(arrived(POSTS[0], true));
      }),
    ));

  it('is false again once the data is loaded behind the data shown', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(
          History.make(Root.actor, { input: Root.startAt('/stats') }),
          loading,
        );
        yield* wait(350);
        expect(status(app, 'Stats')).toEqual(arrived({ visits: 3 }, true));
        send(app, { _tag: 'Reloaded' });
        yield* settle;
        expect(status(app, 'Stats')).toEqual(arrived({ visits: 3 }, false));
      }),
    ));
});

describe("the router's minimum", () => {
  const Quick = Router.define(App, { minimum: 40 });
  const QuickRoot = Router.app(Quick, AppView);
  const quick = Loading.cached(Quick, Loading.memory(Quick, loaders));

  it('is how long a loading screen stays at least: 300 unless said', () =>
    run(
      Effect.gen(function* () {
        expect(Routes.options.minimum).toBe(300);
        expect(Quick.options.minimum).toBe(40);
        const open = hold('Blog.Post:hello');
        const slow = yield* Runtime.start(Root.actor, loading);
        const fast = yield* Runtime.start(QuickRoot.actor, quick);
        push(slow, Routes.Blog.Post({ slug: 'hello' }));
        push(fast, Quick.Blog.Post({ slug: 'hello' }));
        yield* wait(200);
        expect(status(slow, 'Post')).toEqual(LOADING_POST);
        expect(status(fast, 'Post')).toEqual(LOADING_POST);
        open();
        yield* wait(60);
        // Landed at 150: one stays until 190, the other until 450.
        expect(status(fast, 'Post')).toEqual(arrived(POSTS[0], true));
        expect(status(slow, 'Post')).toEqual(LOADING_POST);
        yield* wait(300);
        expect(status(slow, 'Post')).toEqual(arrived(POSTS[0], true));
      }),
    ));
});

describe('a reload anew', () => {
  /** The Stats page's data counts its loads, so new data is told from old. */
  let version = 0;
  const versioned = Loading.cached(
    Routes,
    Loading.memory(
      Routes,
      Routes.loaders({
        ...loaders,
        Stats: () =>
          counted('Stats').pipe(Effect.map(() => ({ visits: (version += 1) }))),
      }),
    ),
  );
  const atStats = Effect.gen(function* () {
    version = 0;
    const app = yield* Runtime.start(Root.actor, versioned);
    push(app, Routes.Stats());
    yield* settle;
    expect(status(app, 'Stats')).toEqual(arrived({ visits: 1 }, false));
    return app;
  });

  it('holds the data shown up to the delay, never refreshing behind it, then shows Loading at least the minimum', () =>
    run(
      Effect.gen(function* () {
        const app = yield* atStats;
        const open = hold('Stats');
        send(app, { _tag: 'Reloaded', anew: true });
        yield* settle;
        expect(router(app).pending).toEqual(
          expect.objectContaining({ to: Routes.Stats(), how: 'reload' }),
        );
        expect(status(app, 'Stats')).toEqual(arrived({ visits: 1 }, false));
        yield* wait(200);
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Stats')).toEqual({
          _tag: 'Loading',
          info: { render: 'client', staleTime: 0 },
        });
        open();
        yield* wait(50);
        expect(status(app, 'Stats')).toEqual(
          expect.objectContaining({ _tag: 'Loading' }),
        );
        yield* wait(300);
        expect(status(app, 'Stats')).toEqual(arrived({ visits: 2 }, true));
        // The page joined the load the Router held: nothing ran twice.
        expect(calls['Stats']).toBe(2);
      }),
    ));

  it('swaps in data that comes within the delay, with no loading screen, and drops every copy the Data cache kept', () =>
    run(
      Effect.gen(function* () {
        const app = yield* atStats;
        send(app, { _tag: 'Preloading', route: Routes.Blog() });
        yield* settle;
        expect(calls['Blog']).toBe(1);
        send(app, { _tag: 'Reloaded', anew: true });
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Stats')).toEqual(arrived({ visits: 2 }, false));
        push(app, Routes.Blog());
        yield* settle;
        expect(calls['Blog']).toBe(2);
      }),
    ));

  it('a move while it is held loads the data it keeps anew too', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Root.actor, loading);
        push(app, Routes.Blog.Post({ slug: 'hello' }));
        yield* settle;
        expect(calls).toEqual({ Blog: 1, 'Blog.Post:hello': 1 });
        hold('Blog.Post:hello');
        send(app, { _tag: 'Reloaded', anew: true });
        yield* settle;
        push(app, Routes.Blog());
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(find(app, 'Post')).toBeUndefined();
        expect(status(app, 'Blog')).toEqual(arrived(BLOG, false));
        expect(calls['Blog']).toBe(2);
      }),
    ));

  it('held, keeps the data shown past the delay and swaps in the new data in one step', () =>
    run(
      Effect.gen(function* () {
        const app = yield* atStats;
        const open = hold('Stats');
        send(app, { _tag: 'Reloaded', anew: true, hold: true });
        yield* wait(500);
        expect(router(app).pending).toEqual(
          expect.objectContaining({ how: 'reload', hold: true }),
        );
        expect(status(app, 'Stats')).toEqual(arrived({ visits: 1 }, false));
        open();
        yield* settle;
        expect(router(app).pending).toBeNull();
        expect(status(app, 'Stats')).toEqual(arrived({ visits: 2 }, false));
        expect(calls['Stats']).toBe(2);
      }),
    ));

  it('held, ends the Command that asked once it lands', () => {
    const Shown = Page.define({
      path: '/',
      render: 'client',
      data: Schema.Struct({ visits: Schema.Number }),
      model: Schema.Struct({ landed: Schema.Boolean }),
      message: Schema.TaggedUnion({ Renew: {}, Landed: {} }),
    });
    const ShownLive = Page.build(Shown, {
      init: () => ({ model: { landed: false } }),
      on: {
        Renew: () => ({
          model: { landed: false },
          command: Command.make('renew', {
            run: () =>
              Navigation.use((navigation) =>
                navigation.reload({ anew: true, hold: true }),
              ).pipe(Effect.as({ _tag: 'Landed' as const })),
          })(),
        }),
        Landed: () => ({ model: { landed: true } }),
      },
    });
    const Top = Page.define({ pages: { Shown } });
    const Held = Router.define(Top);
    let visits = 0;
    const heldLoading = Loading.memory(
      Held,
      Held.loaders({
        Shown: () =>
          counted('Shown').pipe(Effect.map(() => ({ visits: (visits += 1) }))),
      }),
    );
    const HeldRoot = Router.app(
      Held,
      View.make(Page.build(Top, { pages: { Shown: ShownLive } }), () => null),
    );
    return run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(HeldRoot.actor, heldLoading);
        // Past the minimum its first loading screen stays.
        yield* wait(400);
        const open = hold('Shown');
        app.send(find(app, 'Shown')!.id, { _tag: 'Renew' });
        yield* wait(500);
        expect(find(app, 'Shown')!.model).toEqual({ landed: false });
        expect(status(app, 'Shown')).toEqual(arrived({ visits: 1 }, true));
        open();
        yield* settle;
        expect(status(app, 'Shown')).toEqual(arrived({ visits: 2 }, false));
        expect(find(app, 'Shown')!.model).toEqual({ landed: true });
      }),
    );
  });

  it('is the Command Router.reload({ anew: true })', () => {
    expect(Router.reload({ anew: true })).toEqual(
      expect.objectContaining({ name: 'reload', args: { anew: true } }),
    );
    expect(Router.reload()).toEqual(
      expect.objectContaining({ name: 'reload', args: {} }),
    );
  });
});
