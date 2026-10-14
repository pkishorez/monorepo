import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Route } from '../index.ts';
import { tagsOf } from '../route/index.ts';

const Routes = Route.tree(
  {
    Dashboard: Route.path('/', { metadata: { title: 'Dashboard' } }),
    Projects: Route.path(
      '/projects',
      { metadata: { title: 'Projects' } },
      {
        List: Route.path('/', {
          query: { q: Schema.optionalKey(Schema.String) },
        }),
        Project: Route.path('/:id', {
          params: { id: Schema.FiniteFromString },
          metadata: ({ id }) => ({ title: `Project ${id}` }),
        }),
      },
    ),
    Teams: Route.path(
      '/teams/:team',
      { params: { team: Schema.String } },
      {
        Members: Route.path('/'),
        Member: Route.path('/:name', { params: { name: Schema.String } }),
      },
    ),
    Settings: Route.path(
      '/settings',
      {},
      {
        Profile: Route.path('/'),
        Billing: Route.path(
          '/billing',
          { metadata: { title: 'Billing' } },
          {
            Plan: Route.path('/'),
            Invoices: Route.path('/invoices', {
              metadata: { title: 'Invoices' },
            }),
          },
        ),
      },
    ),
  },
  { redirect: { '/account': (r) => r.Settings.Profile() } },
);

describe('a place', () => {
  it('is a tagged value per level', () => {
    expect(Routes.Settings.Billing.Invoices()).toEqual({
      _tag: 'Settings',
      page: { _tag: 'Billing', page: { _tag: 'Invoices' } },
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
      // @ts-expect-error a node with children is not a place
      Routes.Settings();
    };
    expect(typed).toBeTypeOf('function');
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

  it('a node with children is its page at /', () => {
    expect(read('/settings')).toEqual(Routes.Settings.Profile());
    expect(read('/settings/billing')).toEqual(Routes.Settings.Billing.Plan());
  });

  it('params on a node with children', () => {
    expect(read('/teams/core/ada')).toEqual(
      Routes.Teams.Member({ team: 'core', name: 'ada' }),
    );
  });

  it('the query, none, and a repeated key', () => {
    expect(read('/projects?q=ann')).toEqual(Routes.Projects.List({ q: 'ann' }));
    expect(read('/projects')).toEqual(Routes.Projects.List());
    expect(read('/projects?q=a+b')).toEqual(Routes.Projects.List({ q: 'a b' }));
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
      route: Routes.Settings.Profile(),
    });
  });
});

describe('a Route written as a URL', () => {
  it('reads back as itself', () => {
    for (const route of [
      Routes.Dashboard(),
      Routes.Projects.List({ q: 'a b&c/d' }),
      Routes.Projects.List(),
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

describe('the head', () => {
  it('is the deepest that says anything', () => {
    expect(Routes.metadata(Routes.Settings.Billing.Invoices())).toEqual({
      title: 'Invoices',
    });
    expect(Routes.metadata(Routes.Settings.Billing.Plan())).toEqual({
      title: 'Billing',
    });
  });

  it('can be worked out from params, and from a URL, as a server does', () => {
    expect(Routes.metadata('/projects/42')).toEqual({ title: 'Project 42' });
  });
});

describe("a node's Props", () => {
  it('are its value without the tag, with `page` for one with children', () => {
    expect(
      Schema.decodeUnknownSync(Routes.Settings.props)({
        page: { _tag: 'Profile' },
      }),
    ).toEqual({
      page: { _tag: 'Profile' },
    });
    expect(
      Schema.decodeUnknownSync(Routes.props)({ page: Routes.Dashboard() }),
    ).toEqual({
      page: { _tag: 'Dashboard' },
    });
  });
});

it('types a place exactly', () => {
  const probe = () => {
    const project: { readonly _tag: string } = Routes.Projects.Project({
      id: 1,
    });
    const n: number = Routes.Teams.Member({ team: 't', name: 'n' }) && 1;
    // @ts-expect-error a place that is not in the tree
    Routes.Projects.Nowhere();
    return [project, n];
  };
  expect(probe).toBeTypeOf('function');
});

// Inputs, Render Modes, Loaders ----------------------------------------------------

const Post = Schema.Struct({ title: Schema.String });
const Site = Route.tree(
  {
    About: Route.path('/about', {
      metadata: {
        title: 'About',
        description: 'Who we are',
        canonical: 'https://acme.dev/about',
        openGraph: { title: 'About Acme', image: '/og.png' },
        robots: 'index',
      },
    }),
    Blog: Route.path(
      '/blog',
      {
        input: Schema.Array(Post),
        metadata: { openGraph: { type: 'website', title: 'Blog' } },
      },
      {
        Post: Route.path('/:slug', {
          params: { slug: Schema.String },
          input: Post,
          metadata: (_params, post) => ({
            title: post.title,
            openGraph: { title: post.title },
          }),
        }),
      },
    ),
    Account: Route.path(
      '/account/:team',
      { params: { team: Schema.String }, render: 'dynamic' },
      {
        Settings: Route.path('/settings', { input: Post }),
        Activity: Route.path('/activity', { render: 'client', input: Post }),
      },
    ),
  },
  {
    redirect: {
      '/posts/:slug': (r, { slug }) => r.Blog.Post({ slug }),
      '/teams/:team/settings': (r, { team }) => r.Account.Settings({ team }),
    },
  },
);

describe('a place with an Input', () => {
  it('exposes its Schema', () => {
    expect(Site.Blog.input).toBeDefined();
    expect(Site.Blog.Post.input).toBe(Post);
    // @ts-expect-error a place with no Input has no `input`
    expect(Site.About.input).toBeUndefined();
  });

  it('is listed with its dotted name, every param down to it, and its Render Mode', () => {
    expect(
      Site.places(Site.Account.Activity({ team: 'core' })).map(
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
        params: { team: 'core' },
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
    ]);
    // Its dotted name is a Schema too, so a part of a page can take one.
    const isPlace = Schema.is(Site.place);
    expect(isPlace('Account.Activity')).toBe(true);
    expect(isPlace('Account.Nowhere')).toBe(false);
    // @ts-expect-error no place has this name
    const nowhere: typeof Site.place.Type = 'Account.Nowhere';
    expect(nowhere).toBe('Account.Nowhere');
  });

  it('can only be drawn later than the place that holds it', () => {
    const misdrawn = () =>
      (Route.tree as (children: object) => unknown)({
        A: Route.path(
          '/a',
          { render: 'dynamic' },
          {
            B: Route.path('/', { render: 'static' }),
          },
        ),
      });
    expect(misdrawn).toThrow(/A\.B is static/);
    const typed = () => {
      // @ts-expect-error a dynamic place under a client one
      Route.tree({
        A: Route.path(
          '/a',
          { render: 'client' },
          {
            B: Route.path('/', { render: 'dynamic' }),
          },
        ),
      });
    };
    expect(typed).toBeTypeOf('function');
  });
});

describe('the Loaders', () => {
  it('are typed from the Routes: one per place with an Input, and no other', () => {
    const loaders = Site.loaders({
      Blog: () => Effect.succeed([{ title: 'a' }]),
      'Blog.Post': ({ slug }) =>
        slug === 'x'
          ? Effect.fail(Route.notFound())
          : Effect.succeed({ title: slug }),
      'Account.Settings': ({ team }, request) =>
        Effect.succeed({ title: `${team} ${request.method}` }),
      'Account.Activity': (_params, _request) =>
        Effect.fail(Route.redirect(Site.About())),
    });
    expect(Object.keys(loaders)).toHaveLength(4);
    const typed = () => {
      // @ts-expect-error one is missing
      Site.loaders({
        Blog: () => Effect.succeed([]),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
      });
      Site.loaders({
        Blog: () => Effect.succeed([]),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
        // @ts-expect-error a place with no Input has no Loader
        About: () => Effect.succeed({}),
      });
      Site.loaders({
        // @ts-expect-error the Input is a list of posts
        Blog: () => Effect.succeed({ title: '' }),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
      });
      Site.loaders({
        // @ts-expect-error a static place is not handed the request
        Blog: (_params: {}, _request: Request) => Effect.succeed([]),
        'Blog.Post': () => Effect.succeed({ title: '' }),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
      });
      Site.loaders({
        Blog: () => Effect.succeed([]),
        // @ts-expect-error a Loader fails only as not found or a Redirect
        'Blog.Post': () => Effect.fail('nope'),
        'Account.Settings': () => Effect.succeed({ title: '' }),
        'Account.Activity': () => Effect.succeed({ title: '' }),
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
    expect(
      Schema.decodeUnknownSync(Route.NotFound)(
        Schema.encodeUnknownSync(Route.NotFound)(Route.notFound()),
      )._tag,
    ).toBe('NotFound');
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
  it('merges field by field, Open Graph too, and waits for the Inputs it needs', () => {
    const route = Site.Blog.Post({ slug: 'hi' });
    expect(Site.metadata(route)).toEqual({
      openGraph: { type: 'website', title: 'Blog' },
    });
    expect(Site.metadata(route, { 'Blog.Post': { title: 'Hi' } })).toEqual({
      title: 'Hi',
      openGraph: { type: 'website', title: 'Hi' },
    });
  });

  it('writes its tags, each marked, so only those are replaced', () => {
    expect(tagsOf(Site.metadata('/about'))).toEqual([
      {
        tag: 'meta',
        attributes: {
          name: 'description',
          content: 'Who we are',
          'data-kabuki': '',
        },
      },
      {
        tag: 'meta',
        attributes: { name: 'robots', content: 'index', 'data-kabuki': '' },
      },
      {
        tag: 'link',
        attributes: {
          rel: 'canonical',
          href: 'https://acme.dev/about',
          'data-kabuki': '',
        },
      },
      {
        tag: 'meta',
        attributes: {
          property: 'og:title',
          content: 'About Acme',
          'data-kabuki': '',
        },
      },
      {
        tag: 'meta',
        attributes: {
          property: 'og:image',
          content: '/og.png',
          'data-kabuki': '',
        },
      },
    ]);
  });
});

describe("the root's Metadata", () => {
  const Rooted = Route.tree(
    {
      Home: Route.path('/', { metadata: { title: 'Home' } }),
      About: Route.path('/about'),
    },
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
});
