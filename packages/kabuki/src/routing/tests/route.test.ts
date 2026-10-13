import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Route } from '../index.ts';

const Routes = Route.tree(
  {
    Dashboard: Route.path('/', { head: { title: 'Dashboard' } }),
    Projects: Route.path(
      '/projects',
      { head: { title: 'Projects' } },
      {
        List: Route.path('/', {
          query: { q: Schema.optionalKey(Schema.String) },
        }),
        Project: Route.path('/:id', {
          params: { id: Schema.FiniteFromString },
          head: ({ id }) => ({ title: `Project ${id}` }),
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
          { head: { title: 'Billing' } },
          {
            Plan: Route.path('/'),
            Invoices: Route.path('/invoices', { head: { title: 'Invoices' } }),
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
    expect(Routes.head(Routes.Settings.Billing.Invoices())).toEqual({
      title: 'Invoices',
    });
    expect(Routes.head(Routes.Settings.Billing.Plan())).toEqual({
      title: 'Billing',
    });
  });

  it('can be worked out from params, and from a URL, as a server does', () => {
    expect(Routes.head('/projects/42')).toEqual({ title: 'Project 42' });
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
