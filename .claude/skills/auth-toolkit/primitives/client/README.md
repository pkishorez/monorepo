# Client: sign in

Puts a Google sign-in control in an app built by `psf-setup`, wired to the shared Auth Worker with `auth-toolkit/client`. The browser performs a Direct Session Check against the Auth Worker; the app's own server is not involved. There is no "client usage" beyond this: guarded RPC calls need nothing extra, because `/rpc/<name>` is same-origin and the browser attaches the session cookie itself.

## Preconditions

Check both before touching files; stop and report if either fails.

- The app's production host is under the production Auth Worker's cookie domain, and its local host under the local one. Otherwise the cookie is never sent and `useSession` stays signed out forever.
- The Auth Worker's `infra/config.ts` trusts those origins. By default it trusts every origin under each cookie domain.

## Files

Adds:

- `src/client/auth/`: `authClient`. Local dev talks to the local Auth Worker, deployed stages to production. One instance per app; components import it, never create their own.
- `src/routes/components/sign-in.tsx`: `<SignIn />`. Signed out: kui-toolkit's `GoogleButton` plus the login error from `useLoginError`. Signed in: the user's email and a Sign out button. Pending: a fixed-height placeholder so the header never shifts when the session resolves.
- `src/shared/auth/`: copy from `../server-rpc/src/shared/auth` if the app does not have it yet.

## Seams

- `src/routes/page.tsx`: render `<SignIn />` directly after the `<h1>`. Do not build a separate login page; sign-in returns to the page it started from.
- `package.json`: add `auth-toolkit: workspace:*` to dependencies. `kui-toolkit` is already there.
- `laymos.config.json`: add layer `client-auth` (paths `src/client/auth`, module `src/client/auth` exposed) and `shared-auth` if missing (paths `src/shared/auth`, exposed). Add `src/routes/components/sign-in.tsx` to `routes` as `{ "shared": true }`. Rules: `routes` uses `client-auth`; `client-auth` uses `shared-auth`.

## Redirects

`signIn.google()` returns to the current URL with stale `error` parameters stripped. Pass `callbackURL` only when the user asks to land somewhere specific after login; pass `errorCallbackURL` only when a dedicated error page exists. Both must be on a Trusted Origin.

## Verify

`pnpm build`, `pnpm lint`, `pnpm test` pass. Under `pnpm dev`, the page shows the Google button while signed out, with no layout jump when the session check finishes. A full sign-in needs the local Auth Worker running (`pnpm dev` in its package); if it is not, report sign-in as unverified.
