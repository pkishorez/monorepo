import { Page, Router } from '@kestack/kabuki/routing';
import { Console } from './console/index.ts';

/*
 * The route tree, read down from the root, which the browser, the Worker's
 * Loaders and the tests all share:
 *
 *   App                the root: no path, no data, Console in it
 *   └─ Console  /      who the visitor is; the sign-in gate
 *      ├─ Welcome    /                     Connect GitHub; then the member's projects
 *      ├─ Settings   /settings             what a member sets up once: GitHub, credentials
 *      ├─ NewProject /new                  a repository folder to Production deploying
 *      └─ Project    /projects/:projectId  its Production stage and latest run, live
 *         └─ Run     /runs/:runId          one run, step by step
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
export { NewProject, NewProjectStep, Target } from './new-project/index.ts';
export { Project, Run } from './project/index.ts';
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
