import { Context, Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { Types } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import { Navigation, Page, Router } from '../index.ts';
import { tagsOf } from '../route/index.ts';

/*
 * The Routes, read down from the root page: values, URLs both ways,
 * Metadata, places, the typing of the Loaders, and the names of the builds.
 */

const Invoices = Page.define({
  path: '/invoices',
  metadata: { title: 'Invoices' },
});
const Billing = Page.define({
  path: '/billing',
  metadata: { title: 'Billing' },
  pages: { Invoices },
});
const Settings = Page.define({ path: '/settings', pages: { Billing } });
const Member = Page.define({
  path: '/:name',
  params: { name: Schema.String },
});
const Teams = Page.define({
  path: '/teams/:team',
  params: { team: Schema.String },
  pages: { Member },
});
const Project = Page.define({
  path: '/:id',
  params: { id: Schema.FiniteFromString },
  metadata: ({ id }) => ({ title: `Project ${id}` }),
});
const Projects = Page.define({
  path: '/projects',
  query: { q: Schema.optionalKey(Schema.String) },
  metadata: { title: 'Projects' },
  pages: { Project },
});
const Dashboard = Page.define({
  path: '/',
  metadata: { title: 'Dashboard' },
});
const App = Page.define({
  pages: { Dashboard, Projects, Teams, Settings },
});

const Routes = Router.define(App, {
  redirect: { '/account': (r) => r.Settings() },
});

describe('a place', () => {
  it('is a tagged value per level', () => {
    expect(Routes.Settings.Billing.Invoices()).toEqual({
      _tag: 'Settings',
      page: { _tag: 'Billing', page: { _tag: 'Invoices' } },
    });
  });

  it('a page with pages is a place on its own too', () => {
    expect(Routes.Settings.Billing()).toEqual({
      _tag: 'Settings',
      page: { _tag: 'Billing' },
    });
  });

  it("takes its own params and its ancestors'", () => {
    expect(Routes.Teams.Member({ team: 'core', name: 'ada' })).toEqual({
      _tag: 'Teams',
      team: 'core',
      page: { _tag: 'Member', name: 'ada' },
    });
  });

  it('is checked by type', () => {
    const typed = () => {
      // @ts-expect-error id must be a number
      Routes.Projects.Project({ id: 'x' });
      // @ts-expect-error id is required
      Routes.Projects.Project();
      // @ts-expect-error a place that is not in the tree
      Routes.Projects.Nowhere();
    };
    expect(typed).toBeTypeOf('function');
  });

  it('is drawn by a build named after its key, the root by `App`', () => {
    const ProjectLive = Page.build(Project);
    const ProjectsLive = Page.build(Projects, {
      pages: { Project: ProjectLive },
    });
    const BillingLive = Page.build(Billing, {
      pages: { Invoices: Page.build(Invoices) },
    });
    const AppLive = Page.build(App, {
      pages: {
        Dashboard: Page.build(Dashboard),
        Projects: ProjectsLive,
        Teams: Page.build(Teams, { pages: { Member: Page.build(Member) } }),
        Settings: Page.build(Settings, { pages: { Billing: BillingLive } }),
      },
    });
    expect(ProjectLive.name).toBe('Project');
    expect(ProjectsLive.name).toBe('Projects');
    expect(BillingLive.pages.Invoices.name).toBe('Invoices');
    // The root has no key: the Router names it once it is given its View.
    expect(AppLive.name).toBe('Page');
    Router.app(
      Routes,
      View.make(AppLive, () => null),
    );
    expect(AppLive.name).toBe('App');
  });
});

describe('a URL read as a Route', () => {
  const read = (url: string) => Routes.read(url).route;

  it('three levels deep, with or without a trailing slash or a doubled one', () => {
    const invoices = Routes.Settings.Billing.Invoices();
    expect(read('/settings/billing/invoices')).toEqual(invoices);
    expect(read('/settings/billing/invoices/')).toEqual(invoices);
    expect(read('/settings//billing/invoices')).toEqual(invoices);
  });

  it('ends at a page with pages when the URL does', () => {
    expect(read('/settings')).toEqual(Routes.Settings());
    expect(read('/settings/billing')).toEqual(Routes.Settings.Billing());
  });

  it('params on a page with pages', () => {
    expect(read('/teams/core/ada')).toEqual(
      Routes.Teams.Member({ team: 'core', name: 'ada' }),
    );
  });

  it('the query, none, and one on a page with pages', () => {
    expect(read('/projects?q=ann')).toEqual(Routes.Projects({ q: 'ann' }));
    expect(read('/projects')).toEqual(Routes.Projects());
    expect(read('/projects?q=a+b')).toEqual(Routes.Projects({ q: 'a b' }));
    expect(read('/projects/4?q=x')).toEqual(
      Routes.Projects.Project({ q: 'x', id: 4 }),
    );
  });

  it('percent-encoded segments, and unicode', () => {
    expect(read('/teams/caf%C3%A9/a%2Fb')).toEqual(
      Routes.Teams.Member({ team: 'café', name: 'a/b' }),
    );
  });

  it('a malformed segment, a param that does not decode, and nowhere are not found', () => {
    expect(read('/teams/%E0%A4%A')).toEqual({
      _tag: 'NotFound',
      path: '/teams/%E0%A4%A',
    });
    expect(read('/projects/abc')).toEqual({
      _tag: 'NotFound',
      path: '/projects/abc',
    });
    expect(read('/nowhere')).toEqual({ _tag: 'NotFound', path: '/nowhere' });
  });

  it('a redirect names the Route that replaces it', () => {
    expect(Routes.read('/account')).toEqual({
      _tag: 'Redirect',
      route: Routes.Settings(),
    });
  });
});

describe('a Route written as a URL', () => {
  it('reads back as itself', () => {
    for (const route of [
      Routes.Dashboard(),
      Routes.Projects({ q: 'a b&c/d' }),
      Routes.Projects(),
      Routes.Projects.Project({ id: 7 }),
      Routes.Teams.Member({ team: 'café', name: 'a/b' }),
      Routes.Settings.Billing.Invoices(),
    ])
      expect(Routes.read(Routes.path(route)).route).toEqual(route);
  });

  it('is the one way to write a place: a non-canonical URL reads as the same Route', () => {
    const route = Routes.read('/projects/01/').route;
    expect(Routes.path(route)).toBe('/projects/1');
  });
});

describe('the paths', () => {
  it('are printed as written from the root', () => {
    expect(Routes.paths()).toEqual({
      Dashboard: '/',
      Projects: '/projects',
      'Projects.Project': '/projects/:id',
      Teams: '/teams/:team',
      'Teams.Member': '/teams/:team/:name',
      Settings: '/settings',
      'Settings.Billing': '/settings/billing',
      'Settings.Billing.Invoices': '/settings/billing/invoices',
    });
  });

  it('may not clash: two places at one path are refused', () => {
    const A = Page.define({
      path: '/x/:id',
      params: { id: Schema.String },
    });
    const B = Page.define({
      path: '/x/:name',
      params: { name: Schema.String },
    });
    const Root = Page.define({ pages: { A, B } });
    expect(() => Router.define(Root)).toThrow(/A and B are both at \/x\/:name/);
  });
});

describe('the Metadata', () => {
  it('is the deepest that says anything', () => {
    expect(Routes.metadata(Routes.Settings.Billing.Invoices())).toEqual({
      title: 'Invoices',
    });
    expect(Routes.metadata(Routes.Settings.Billing())).toEqual({
      title: 'Billing',
    });
  });

  it('can be worked out from params, and from a URL, as a server does', () => {
    expect(Routes.metadata('/projects/42')).toEqual({ title: 'Project 42' });
  });
});

// Data, Render Modes, Loaders ------------------------------------------------------

const Post = Schema.Struct({ title: Schema.String });
const About = Page.define({
  path: '/about',
  metadata: {
    title: 'About',
    description: 'Who we are',
    canonical: 'https://acme.dev/about',
    openGraph: { title: 'About Acme', image: '/og.png' },
    robots: 'index',
  },
});
const BlogPost = Page.define({
  path: '/:slug',
  params: { slug: Schema.String },
  data: Post,
  metadata: (_params, post) => ({
    title: post?.title ?? 'A post',
    ...(post ? { openGraph: { title: post.title } } : {}),
  }),
});
const Blog = Page.define({
  path: '/blog',
  data: Schema.Array(Post),
  metadata: { openGraph: { type: 'website', title: 'Blog' } },
  pages: { Post: BlogPost },
});
const AccountSettings = Page.define({ path: '/settings', data: Post });
const Activity = Page.define({
  path: '/activity',
  render: 'client',
  query: { since: Schema.optionalKey(Schema.String) },
  data: Post,
});
const Static = Page.define({
  path: '/static',
  render: 'static',
  data: Post,
});
const Account = Page.define({
  path: '/account/:team',
  params: { team: Schema.String },
  render: 'dynamic',
  pages: { Settings: AccountSettings, Activity, Static },
});
const SiteRoot = Page.define({ pages: { About, Blog, Account } });
const Site = Router.define(SiteRoot, {
  redirect: {
    '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }),
    '/teams/:team/settings': (r, { team }) => r.Account.Settings({ team }),
  },
});

describe('a place with data', () => {
  it("exposes its data's Schema", () => {
    expect(Site.Blog.data).toBeDefined();
    expect(Site.Blog.Post.data).toBe(Post);
    // @ts-expect-error a place with no data has no `data`
    expect(Site.About.data).toBeUndefined();
  });

  it('is listed with its dotted name, what its Loader is handed, and its Render Mode', () => {
    expect(
      Site.places(Site.Account.Activity({ team: 'core', since: 'mon' })).map(
        ({ name, params, render, input }) => ({
          name,
          params,
          render,
          input: input !== undefined,
        }),
      ),
    ).toEqual([
      {
        name: 'Account',
        params: { team: 'core' },
        render: 'dynamic',
        input: false,
      },
      {
        name: 'Account.Activity',
        params: { team: 'core', since: 'mon' },
        render: 'client',
        input: true,
      },
    ]);
    expect(Site.places('/nowhere')).toEqual([]);
    expect(Site.every.map((place) => [place.name, place.render])).toEqual([
      ['About', 'static'],
      ['Blog', 'static'],
      ['Blog.Post', 'static'],
      ['Account', 'dynamic'],
      ['Account.Settings', 'dynamic'],
      ['Account.Activity', 'client'],
      // A static place may sit under a dynamic one.
      ['Account.Static', 'static'],
    ]);
    const isPlace = Schema.is(Site.place);
    expect(isPlace('Account.Activity')).toBe(true);
    expect(isPlace('Account.Nowhere')).toBe(false);
  });

  it('is the same place, the same key, whatever its query', () => {
    const [, a] = Site.places(Site.Account.Activity({ team: 'core' }));
    const [, b] = Site.places(
      Site.Account.Activity({ team: 'core', since: 'mon' }),
    );
    expect(a!.key).toBe(b!.key);
  });
});

describe('the Loaders', () => {
  it('are typed from the Routes: one per place with data, and no other', () => {
    const loaders = Site.loaders({
      Blog: () => Effect.succeed([{ title: 'a' }]),
      'Blog.Post': ({ slug }) =>
        slug === 'x'
          ? Effect.fail(Page.notFound())
          : Effect.succeed({ title: slug }),
      'Account.Settings': ({ team }, request) =>
        Effect.succeed({ title: `${team} ${request.method}` }),
      'Account.Activity': ({ since }, _request) =>
        since === undefined
          ? Effect.fail(Page.redirect(Site.About()))
          : Effect.succeed({ title: since }),
      'Account.Static': ({ team }) => Effect.succeed({ title: team }),
    });
    expect(Object.keys(loaders)).toHaveLength(5);
    const typed = () => {
      // @ts-expect-error one is missing
      Site.loaders({
        Blog: () => Effect.succeed([]),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Static': () => Effect.succeed({ title: '' }),
      });
      Site.loaders({
        Blog: () => Effect.succeed([]),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
        'Account.Static': () => Effect.succeed({ title: '' }),
        // @ts-expect-error a place with no data has no Loader
        About: () => Effect.succeed({}),
      });
      Site.loaders({
        // @ts-expect-error the data is a list of posts
        Blog: () => Effect.succeed({ title: '' }),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
        'Account.Static': () => Effect.succeed({ title: '' }),
      });
      Site.loaders({
        // @ts-expect-error a static place is not handed the request
        Blog: (_params: {}, _request: Request) => Effect.succeed([]),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
        'Account.Static': () => Effect.succeed({ title: '' }),
      });
      Site.loaders({
        Blog: () => Effect.succeed([]),
        // @ts-expect-error a Loader fails only as not found or a Redirect
        'Blog.Post': () => Effect.fail('nope'),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
        'Account.Static': () => Effect.succeed({ title: '' }),
      });
    };
    expect(typed).toBeTypeOf('function');
  });

  it('fail with errors their Schemas can carry over the wire', () => {
    const carried = (redirect: Page.Redirect) =>
      Schema.decodeUnknownSync(Page.Redirect)(
        JSON.parse(
          JSON.stringify(Schema.encodeUnknownSync(Page.Redirect)(redirect)),
        ),
      );
    const decoded = carried(Page.redirect(Site.About()));
    expect(decoded).toBeInstanceOf(Page.Redirect);
    expect(decoded.route).toEqual(Site.About());
    expect(
      carried(Page.redirect(Site.About(), { permanent: true })).permanent,
    ).toBe(true);
    expect(carried(Page.redirect('https://example.com/a')).href).toBe(
      'https://example.com/a',
    );
  });

  it("Redirect only to the app's own Routes, or to a whole URL", () => {
    const Other = Router.define(
      Page.define({ pages: { Elsewhere: Page.define({ path: '/x' }) } }),
    );
    const typed = () => {
      Site.loaders({
        Blog: () => Effect.fail(Page.redirect('https://example.com/blog')),
        'Blog.Post': () =>
          Effect.fail(Page.redirect(Site.About(), { permanent: true })),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
        'Account.Static': () => Effect.succeed({ title: '' }),
      });
      Site.loaders({
        Blog: () => Effect.succeed([]),
        // @ts-expect-error a Route of another app
        'Blog.Post': () => Effect.fail(Page.redirect(Other.Elsewhere())),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
        'Account.Static': () => Effect.succeed({ title: '' }),
      });
      // @ts-expect-error a path is a Route, or a whole URL
      Page.redirect('/about');
    };
    expect(typed).toBeTypeOf('function');
    expect(() => Page.redirect('javascript:alert(1)' as 'https://x')).toThrow(
      'http or https',
    );
  });
});

describe('a redirect with params', () => {
  it('names the Route that replaces it, from what its path holds', () => {
    expect(Site.read('/posts/hello')).toEqual({
      _tag: 'Redirect',
      route: Site.Blog.Post({ slug: 'hello' }),
    });
    expect(Site.read('/teams/core/settings').route).toEqual(
      Site.Account.Settings({ team: 'core' }),
    );
    expect(Site.read('/posts/hello/more').route._tag).toBe('NotFound');
  });
});

describe('the Metadata, in full', () => {
  it('merges field by field, Open Graph too, and is handed the data once there', () => {
    const route = Site.Blog.Post({ slug: 'hi' });
    expect(Site.metadata(route)).toEqual({
      title: 'A post',
      openGraph: { type: 'website', title: 'Blog' },
    });
    expect(Site.metadata(route, { 'Blog.Post': { title: 'Hi' } })).toEqual({
      title: 'Hi',
      openGraph: { type: 'website', title: 'Hi' },
    });
  });

  it('writes its tags, each marked, so only those are replaced', () => {
    expect(
      tagsOf(Site.metadata('/about')).map(({ attributes }) => attributes),
    ).toEqual([
      { name: 'description', content: 'Who we are', 'data-kabuki': '' },
      { name: 'robots', content: 'index', 'data-kabuki': '' },
      { rel: 'canonical', href: 'https://acme.dev/about', 'data-kabuki': '' },
      { property: 'og:title', content: 'About Acme', 'data-kabuki': '' },
      { property: 'og:image', content: '/og.png', 'data-kabuki': '' },
    ]);
  });
});

describe("the root's Metadata", () => {
  const Home = Page.define({ path: '/', metadata: { title: 'Home' } });
  const Plain = Page.define({ path: '/about' });
  const Rooted = Router.define(
    Page.define({
      metadata: { title: 'Site', description: 'A site' },
      pages: { Home, About: Plain },
    }),
    { notFound: { title: 'Not found', robots: 'noindex' } },
  );

  it('is under every place, field by field', () => {
    expect(Rooted.metadata('/')).toEqual({
      title: 'Home',
      description: 'A site',
    });
    expect(Rooted.metadata('/about')).toEqual({
      title: 'Site',
      description: 'A site',
    });
  });

  it("is under the not-found Route's", () => {
    expect(Rooted.metadata('/nowhere')).toEqual({
      title: 'Not found',
      description: 'A site',
      robots: 'noindex',
    });
  });

  it('is a root page with no data', () => {
    const Loaded = Page.define({ data: Post });
    // @ts-expect-error the root page has no data
    expect(() => Router.define(Loaded)).toThrow(/root page has no data/);
  });
});

describe('the Stale time', () => {
  const Data = Schema.Struct({ n: Schema.Number });
  const Item = Page.define({
    path: '/:id',
    params: { id: Schema.String },
    data: Data,
  });
  const Quick = Page.define({ path: '/quick', data: Data, staleTime: 10 });
  const Pinned = Page.define({ path: '/pinned', render: 'static', data: Data });
  const Feed = Page.define({
    path: '/feed',
    render: 'dynamic',
    data: Data,
    staleTime: 5_000,
    pages: { Quick, Pinned, Item },
  });
  const Live = Page.define({ path: '/live', render: 'client', data: Data });
  const Fixed = Page.define({ path: '/fixed', data: Data });
  const Root = Page.define({ pages: { Feed, Live, Fixed } });

  it("is a place's own, else its parent's, else the Router's; a static place's is Infinity", () => {
    const Fresh = Router.define(Root, { staleTime: 1_000 });
    expect(Fresh.every.map((place) => [place.name, place.staleTime])).toEqual([
      ['Feed', 5_000],
      ['Feed.Quick', 10],
      ['Feed.Pinned', Infinity],
      ['Feed.Item', 5_000],
      ['Live', 1_000],
      ['Fixed', Infinity],
    ]);
  });

  it('is 0 unless the Router says', () => {
    expect(
      Router.define(Root).every.find(({ name }) => name === 'Live')?.staleTime,
    ).toBe(0);
  });

  it('is refused on a static page', () => {
    // @ts-expect-error a static page has no Stale time
    Page.define({ path: '/x', render: 'static', data: Data, staleTime: 5 });
    // A page static from its parent says so when the Router is made.
    const Inside = Page.define({ path: '/inside', data: Data, staleTime: 5 });
    const Outer = Page.define({ path: '/outer', pages: { Inside } });
    expect(() => Router.define(Page.define({ pages: { Outer } }))).toThrow(
      /Outer\.Inside is static/,
    );
  });
});

describe("a page's Provides", () => {
  it('cover what the pages under it need: the need stops at the page', () => {
    class Greeting extends Context.Service<
      Greeting,
      { readonly text: string }
    >()('Greeting') {}
    const Child = Page.define({ path: '/child', requires: [Greeting] });
    const ChildLive = Page.build(Child, {
      workers: {
        greet: { run: () => Effect.flatMap(Greeting, () => Effect.never) },
      },
    });
    const Parent = Page.define({ pages: { Child } });
    const ParentLive = Page.build(Parent, {
      pages: { Child: ChildLive },
      provides: () => Layer.succeed(Greeting, { text: 'hi' }),
    });
    type Same<X, Y> =
      (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
        ? true
        : false;
    const child: Same<Types<typeof ChildLive>['open'], Greeting | Navigation> =
      true;
    const parent: Same<Types<typeof ParentLive>['open'], Navigation> = true;
    expect([child, parent]).toEqual([true, true]);
  });
});

describe('a whole query', () => {
  const Authorize = Page.define({
    path: '/authorize',
    query: {
      client_id: Schema.optionalKey(Schema.String),
      search: Page.wholeQuery,
    },
  });
  const Signed = Router.define(
    Page.define({ pages: { Authorize, Dashboard } }),
  );
  const SIGNED =
    'client_id=notes&scope=a+b&ba_param=client_id&ba_param=scope&sig=s1';

  it('reads every pair of the query as written, a repeated one too', () => {
    expect(Signed.read(`/authorize?${SIGNED}`).route).toEqual({
      _tag: 'Authorize',
      client_id: 'notes',
      search: SIGNED,
    });
    expect(Signed.read('/authorize').route).toEqual({ _tag: 'Authorize' });
  });

  it('writes it back whole, each field said over it', () => {
    const route = Signed.read(`/authorize?${SIGNED}`).route;
    expect(Signed.path(route)).toBe(`/authorize?${SIGNED}`);
    expect(
      Signed.path(Signed.Authorize({ search: SIGNED, client_id: 'other' })),
    ).toBe(
      '/authorize?client_id=other&scope=a+b&ba_param=client_id&ba_param=scope&sig=s1',
    );
    expect(Signed.path(Signed.Authorize({ client_id: 'notes' }))).toBe(
      '/authorize?client_id=notes',
    );
  });

  it('is what the Loader is handed, and the Data cache keeps a copy under', () => {
    const [place] = Signed.places(`/authorize?${SIGNED}`);
    expect(place?.params).toEqual({ client_id: 'notes', search: SIGNED });
    const [other] = Signed.places('/authorize?client_id=notes&sig=s2');
    expect(other?.params).not.toEqual(place?.params);
  });
});
