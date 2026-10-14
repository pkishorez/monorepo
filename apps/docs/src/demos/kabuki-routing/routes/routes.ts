import { Route } from '@kestack/kabuki/routing';
import { App } from '../app/index.ts';

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

/**
 * Every place in the demo app, read down from its root page once first
 * used, so the pages can import them. Each page writes its own path; Home
 * and sign-in are public, the rest needs a user.
 */
export const Routes = Route.tree(() => App, {
  // Old addresses that are never a place: replaced, so Back skips them.
  redirect: {
    '/account': (r) => r.Settings(),
    '/billing': (r) => r.Settings.Billing(),
  },
});

export type Route = typeof Routes.route.Type;

/** The app is mounted on TanStack's catch-all route under this path. */
export const BASE = '/demos/kabuki-routing';
