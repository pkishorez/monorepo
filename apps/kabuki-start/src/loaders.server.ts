import { Clock, Effect } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Backend } from './backend/index.ts';
import { Routes } from './routes.ts';
import { Session } from './session/index.ts';

/*
 * One Loader per place with an Input. A static place's is handed its params
 * alone, so what it answers is the same for everyone; a dynamic or client
 * place's gets the request too, and reads the session from its cookie.
 */

/**
 * What `query` reads from the backend, or not found if it finds nothing.
 * The answer is stamped with when it was read: the pages show it, to tell
 * an Input that came with the page from one the browser fetched.
 */
const read = <A extends object, E>(
  query: (db: Backend['Service']) => Effect.Effect<A | undefined, E>,
) =>
  Effect.gen(function* () {
    const found = yield* query(yield* Backend);
    if (found === undefined) return yield* Route.notFound();
    return { ...found, loadedAt: yield* Clock.currentTimeMillis };
  });

/** Who is signed in, or a Redirect to sign in. */
const user = (request: Request) => {
  const name = Session.user(request);
  return name === undefined
    ? Effect.fail(Route.redirect(Routes.SignIn()))
    : Effect.succeed(name);
};

export default Routes.loaders({
  Blog: () => read((db) => db.posts),
  'Blog.Post': ({ slug }) => read((db) => db.post(slug)),
  Docs: () => read((db) => db.docs),
  'Docs.Page': ({ page }) => read((db) => db.doc(page)),
  Account: (_params, request) =>
    read((db) => Effect.flatMap(user(request), db.viewer)),
  'Account.Settings': (_params, request) =>
    read((db) => Effect.flatMap(user(request), db.prefs)),
  'Account.Activity': (_params, request) =>
    read((db) => Effect.flatMap(user(request), db.activity)),
  Dashboard: () => read((db) => db.stats),
  'Dashboard.Report': ({ id }) => read((db) => db.report(id)),
  Shop: () => read((db) => db.products),
  'Shop.Cart': (_params, request) =>
    read((db) => db.cart(Session.cart(request))),
});
