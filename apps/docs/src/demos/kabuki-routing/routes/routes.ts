import { Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';

/** The projects every page reads: the demo has no backend. */
export const PROJECTS: ReadonlyArray<{
  readonly id: number;
  readonly name: string;
}> = [
  { id: 1, name: 'Lighthouse' },
  { id: 2, name: 'Harbor' },
  { id: 3, name: 'Compass' },
  { id: 4, name: 'Anchor' },
  { id: 5, name: 'Beacon' },
];

/** Every place in the demo app, once. Home and sign-in are public; the rest needs a user. */
export const Routes = Route.tree(
  {
    Home: Route.path('/', { metadata: { title: 'Acme' } }),
    SignIn: Route.path('/sign-in', { metadata: { title: 'Sign in · Acme' } }),
    Dashboard: Route.path('/dashboard', {
      metadata: { title: 'Dashboard · Acme' },
    }),
    Projects: Route.path(
      '/projects',
      { metadata: { title: 'Projects · Acme' } },
      {
        List: Route.path('/', {
          query: { q: Schema.optionalKey(Schema.String) },
        }),
        Project: Route.path('/:id', {
          params: { id: Schema.FiniteFromString },
          // The title is the project's name, worked out from the Route alone.
          metadata: ({ id }) => ({
            title: `${PROJECTS.find((each) => each.id === id)?.name ?? `Project ${id}`} · Acme`,
          }),
        }),
        Share: Route.path('/:id/share', {
          params: { id: Schema.FiniteFromString },
        }),
      },
    ),
    Settings: Route.path(
      '/settings',
      { metadata: { title: 'Settings · Acme' } },
      {
        Profile: Route.path('/'),
        Billing: Route.path(
          '/billing',
          { metadata: { title: 'Billing · Acme' } },
          {
            Plan: Route.path('/'),
            Invoices: Route.path('/invoices', {
              metadata: { title: 'Invoices · Acme' },
            }),
          },
        ),
      },
    ),
  },
  {
    // Old addresses that are never a place: replaced, so Back skips them.
    redirect: {
      '/account': (r) => r.Settings.Profile(),
      '/billing': (r) => r.Settings.Billing.Plan(),
    },
  },
);

export type Route = typeof Routes.route.Type;

/** The app is mounted on TanStack's catch-all route under this path. */
export const BASE = '/demos/kabuki-routing';
