import { Page, Router } from '@kestack/kabuki/routing';
import { Console } from './console/index.ts';

/*
 * The route tree, read down from the root, which the browser, the Worker's
 * Loaders and the tests all share:
 *
 *   App                the root: no path, no data, Console in it
 *   └─ Console  /      who the visitor is; the sign-in gate
 *      ├─ Welcome  /           the next step for a member with no GitHub yet
 *      └─ Settings /settings   what a member sets up once: credentials
 */

/** The root page, which Kabuki requires to have no data: it only holds Console. */
export const App = Page.define({ pages: { Console } });

export const router = Router.define(App, {
  notFound: { title: 'Not found · Alchemy Console', robots: 'noindex' },
  // Every page's data is one member's, and an Account Switch is not a move:
  // never show a copy kept for the account before.
  cacheSize: 0,
});

export {
  Account,
  Console,
  ConsoleModel,
  ConsoleState,
  Visitor,
} from './console/index.ts';
export { Settings } from './settings/index.ts';
export { Welcome } from './welcome/index.ts';
export {
  Api,
  Browser,
  NotSignedIn,
  Session,
  type ConsoleClient,
  type Connection,
} from './capabilities/index.ts';
