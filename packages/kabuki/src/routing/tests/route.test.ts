import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Route } from '../index.ts';
import { tagsOf } from '../route/index.ts';

/*
 * The Routes, read down from the root page: values, URLs both ways,
 * Metadata, places and the typing of the Loaders.
 */

const Invoices = Route.page({
  path: '/invoices',
  metadata: { title: 'Invoices' },
}).build({});
const Billing = Route.page({
  path: '/billing',
  metadata: { title: 'Billing' },
  pages: { Invoices },
}).build({});
const Settings = Route.page({ path: '/settings', pages: { Billing } }).build(
  {},
);
const Member = Route.page({
  path: '/:name',
  params: { name: Schema.String },
}).build({});
const Teams = Route.page({
  path: '/teams/:team',
  params: { team: Schema.String },
  pages: { Member },
}).build({});
const Project = Route.page({
  path: '/:id',
  params: { id: Schema.FiniteFromString },
  metadata: ({ id }) => ({ title: `Project ${id}` }),
}).build({});
const Projects = Route.page({
  path: '/projects',
  query: { q: Schema.optionalKey(Schema.String) },
  metadata: { title: 'Projects' },
  pages: { Project },
}).build({});
const Dashboard = Route.page({
  path: '/',
  metadata: { title: 'Dashboard' },
}).build({});
const App = Route.page({
  pages: { Dashboard, Projects, Teams, Settings },
}).build({});

const Routes = Route.tree(App, {
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

  it('is named after its key, its Actor and Place too', () => {
    expect(Project.actor.name).toBe('Project');
    expect(Project.place.name).toBe('ProjectPlace');
    expect(App.actor.name).toBe('App');
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
    const A = Route.page({
      path: '/x/:id',
      params: { id: Schema.String },
    }).build({});
    const B = Route.page({
      path: '/x/:name',
      params: { name: Schema.String },
    }).build({});
    const Root = Route.page({ pages: { A, B } }).build({});
    expect(() => Route.tree(Root)).toThrow(/A and B are both at \/x\/:name/);
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
const About = Route.page({
  path: '/about',
  metadata: {
    title: 'About',
    description: 'Who we are',
    canonical: 'https://acme.dev/about',
    openGraph: { title: 'About Acme', image: '/og.png' },
    robots: 'index',
  },
}).build({});
const BlogPost = Route.page({
  path: '/:slug',
  params: { slug: Schema.String },
  data: Post,
  metadata: (_params, post) => ({
    title: post?.title ?? 'A post',
    ...(post ? { openGraph: { title: post.title } } : {}),
  }),
}).build({});
const Blog = Route.page({
  path: '/blog',
  data: Schema.Array(Post),
  metadata: { openGraph: { type: 'website', title: 'Blog' } },
  pages: { Post: BlogPost },
}).build({});
const AccountSettings = Route.page({ path: '/settings', data: Post }).build({});
const Activity = Route.page({
  path: '/activity',
  render: 'client',
  query: { since: Schema.optionalKey(Schema.String) },
  data: Post,
}).build({});
const Static = Route.page({
  path: '/static',
  render: 'static',
  data: Post,
}).build({});
const Account = Route.page({
  path: '/account/:team',
  params: { team: Schema.String },
  render: 'dynamic',
  pages: { Settings: AccountSettings, Activity, Static },
}).build({});
const SiteRoot = Route.page({ pages: { About, Blog, Account } }).build({});
const Site = Route.tree(SiteRoot, {
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
          ? Effect.fail(Route.notFound())
          : Effect.succeed({ title: slug }),
      'Account.Settings': ({ team }, request) =>
        Effect.succeed({ title: `${team} ${request.method}` }),
      'Account.Activity': ({ since }, _request) =>
        since === undefined
          ? Effect.fail(Route.redirect(Site.About()))
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
    const redirect = Route.redirect(Site.About());
    const encoded = Schema.encodeUnknownSync(Route.Redirect)(redirect);
    const decoded = Schema.decodeUnknownSync(Route.Redirect)(
      JSON.parse(JSON.stringify(encoded)),
    );
    expect(decoded).toBeInstanceOf(Route.Redirect);
    expect(decoded.route).toEqual(Site.About());
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
  const Home = Route.page({ path: '/', metadata: { title: 'Home' } }).build({});
  const Plain = Route.page({ path: '/about' }).build({});
  const Rooted = Route.tree(
    Route.page({ pages: { Home, About: Plain } }).build({}),
    {
      metadata: { title: 'Site', description: 'A site' },
      notFound: { title: 'Not found', robots: 'noindex' },
    },
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
    const Loaded = Route.page({ data: Post }).build({});
    // @ts-expect-error the root page has no data
    expect(() => Route.tree(Loaded)).toThrow(/root page has no data/);
  });
});
