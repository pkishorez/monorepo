import { Clock, Effect } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start/server';
import type { WorkerEnv } from '../infra/index.ts';
import { Backend } from './backend/index.ts';
import { Routes, Visitor } from '../shared/index.ts';

/*
 * One Loader per place with an Input, and the tiers of what they Require:
 *
 *   instance  the pretend backend, made once            every Loader
 *   visitor   who is visiting, from the request's cookies  dynamic and client Loaders
 *
 * A static place's Loader is handed its params alone and may not use the
 * Visitor, so what it answers is the same for everyone: a type error says
 * so if it tries.
 */

/**
 * What `query` reads from the backend, or not found if it finds nothing.
 * The answer is stamped with when it was read: the pages show it, to tell
 * an Input that came with the page from one the browser fetched.
 */
const read = <A extends object, E, R>(
  query: (db: Backend['Service']) => Effect.Effect<A | undefined, E, R>,
) =>
  Effect.gen(function* () {
    const found = yield* query(yield* Backend);
    if (found === undefined) return yield* Route.notFound();
    return { ...found, loadedAt: yield* Clock.currentTimeMillis };
  });

/** Who is signed in, or a Redirect to sign in. */
const user = Effect.gen(function* () {
  const { name } = yield* Visitor;
  if (name === undefined) return yield* Route.redirect(Routes.SignIn());
  return name;
});

const loaders = Routes.loaders({
  Blog: () => read((db) => db.posts),
  'Blog.Post': ({ slug }) => read((db) => db.post(slug)),
  Docs: () => read((db) => db.docs),
  'Docs.Page': ({ page }) => read((db) => db.doc(page)),
  Account: () => read((db) => Effect.flatMap(user, db.viewer)),
  'Account.Settings': () => read((db) => Effect.flatMap(user, db.prefs)),
  'Account.Activity': () => read((db) => Effect.flatMap(user, db.activity)),
  Dashboard: () => read((db) => db.stats),
  'Dashboard.Report': ({ id }) => read((db) => db.report(id)),
  Shop: () => read((db) => db.products),
  'Shop.Cart': () =>
    read((db) =>
      Effect.gen(function* () {
        return yield* db.cart((yield* Visitor).cart);
      }),
    ),
});

export default Start.layers<WorkerEnv>()
  .instance(() => Backend.memory)
  .visitor(({ request }) => Visitor.fromRequest(request))
  .loaders(loaders);
