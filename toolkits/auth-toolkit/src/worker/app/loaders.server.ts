import { Context, Effect, Layer } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start/server';
import {
  pagesData,
  returnDestination,
  sameOriginPath,
  signedOAuthQuery,
  type PageData,
  type PagesEnv,
} from './api/index.ts';
import { router } from './pages/index.ts';

/*
 * Every page arrives with its data: the Auth Worker is the server, so each
 * Loader reads this browser's Accounts, Sign-ins, Grants and requests in
 * process, from the request's cookies, through what the worker hands its
 * pages. Nothing read here carries a token (ADR 0019).
 */

class Pages extends Context.Service<Pages, PagesEnv>()(
  '@kestack/auth-toolkit/pages/Pages',
) {}

/** A read's failure, as its endpoint would answer it. */
interface Failure {
  readonly code: string;
  readonly message: string;
}

const failureOf = (cause: unknown): Failure => {
  const { code, message } = (cause ?? {}) as Partial<Failure>;
  return {
    code: typeof code === 'string' ? code : 'failed',
    message: typeof message === 'string' ? message : String(cause),
  };
};

const read = <A>(run: (reads: PagesEnv['reads']) => Promise<A>) =>
  Effect.gen(function* () {
    const { reads } = yield* Pages;
    return yield* Effect.tryPromise({
      try: () => run(reads),
      catch: failureOf,
    });
  });

/** A read the page can't be drawn without: its failure breaks the page. */
const must = <A>(run: (reads: PagesEnv['reads']) => Promise<A>) =>
  read(run).pipe(Effect.orDie);

/** What every page is drawn with: the pages context and this browser's Accounts. */
const visit = (request: Request) =>
  Effect.gen(function* () {
    const env = yield* Pages;
    const { active, accounts } = yield* must((reads) =>
      reads.accounts(request),
    );
    return {
      ...pagesData(env),
      accounts: { active, list: [...accounts] },
    } satisfies PageData;
  });

/** The app a Login continues to: an OAuth Client's, or a Device's. */
const continuing = (search: string, returnTo: string | undefined) =>
  Effect.gen(function* () {
    if (signedOAuthQuery(search)) {
      const { client } = yield* read((reads) => reads.consentRequest(search));
      return client.name;
    }
    const back = sameOriginPath(returnTo);
    if (!back?.startsWith('/device')) return null;
    const params = new URL(back, 'http://x').searchParams;
    const code = params.get('code') ?? params.get('user_code');
    if (!code) return null;
    const { app } = yield* read((reads) => reads.deviceRequest(code));
    return app;
  }).pipe(Effect.orElseSucceed(() => null));

const loaders = router.loaders({
  // Signed out, the Home Page is the Login Screen's to show.
  Home: (_, request) =>
    Effect.gen(function* () {
      const page = yield* visit(request);
      if (page.accounts.active === null)
        return yield* Effect.fail(
          Page.redirect(router.Login({ return_to: '/' })),
        );
      const [signIns, grants] = yield* Effect.all(
        [
          must((reads) => reads.signIns(request)),
          must((reads) => reads.grants(request)),
        ],
        { concurrency: 2 },
      );
      return { ...page, signIns: [...signIns], grants: [...grants] };
    }),
  // Signed in with nothing to continue or add: back where `return_to` says.
  Login: (query, request) =>
    Effect.gen(function* () {
      const page = yield* visit(request);
      const staying =
        query.client_id !== undefined || query.add_account !== undefined;
      if (page.accounts.active !== null && !staying) {
        const back = new URL(
          returnDestination(query.return_to, page),
          page.origin,
        );
        return yield* Effect.fail(
          Page.redirect(back.href as `https://${string}`),
        );
      }
      return {
        ...page,
        continuing: yield* continuing(query.search ?? '', query.return_to),
      };
    }),
  // Looks the code up without claiming it: better-auth binds a code to the
  // first signed-in viewer of `/device/verify`, so that waits for Approve.
  Device: (query, request) =>
    Effect.gen(function* () {
      const page = yield* visit(request);
      const code = (query.code ?? query.user_code)?.trim();
      if (!code) return { ...page, lookup: null };
      const lookup = yield* read((reads) => reads.deviceRequest(code)).pipe(
        Effect.map((found) => ({ _tag: 'Found' as const, ...found })),
        Effect.catch((failure) =>
          Effect.succeed({ _tag: 'Failed' as const, ...failure }),
        ),
      );
      return { ...page, lookup };
    }),
  // The signed request is the page's whole query, as its address gives it.
  Consent: (query, request) =>
    Effect.gen(function* () {
      const page = yield* visit(request);
      const search = query.search ?? '';
      const consent = yield* read((reads) => reads.consentRequest(search)).pipe(
        Effect.map((found) => ({
          _tag: 'Found' as const,
          client: found.client,
          scopes: [...found.scopes],
          query: search,
        })),
        Effect.catch((failure) =>
          Effect.succeed({
            _tag: 'Invalid' as const,
            message: failure.message,
          }),
        ),
      );
      return { ...page, request: consent };
    }),
  Error: (_, request) => visit(request),
});

export default Start.layers<PagesEnv>()
  .request((env) => Layer.succeed(Pages, env))
  .loaders(loaders);
