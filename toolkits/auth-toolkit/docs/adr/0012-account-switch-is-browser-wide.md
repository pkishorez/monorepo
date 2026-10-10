# 12. Account Switch is browser-wide

> Names changed since this was written ([ADR 0005](../../../../docs/adr/0005-three-toolkits-three-doors.md)): the doors are now `worker`, `worker/memory`, `worker/alchemy`, `guard`, `server`, `server/cloud`, `client`, `client/web`, `client/expo` and `client/cli`; Cannotation is Middleware; `CurrentAuth` is `Authz.Current`, `VerificationUnavailable` is `Authz.Unavailable`; `authzLayer` is `authz.layer`, `authzCookies` is `authz.cookies`, `resolverLive` is `authz.cloud`, `resolverLocal` is `authz.device`; the `Auth` service is `SignIn`, `authLive` is `cookie` (from `client/web`), `authExpo` is `oauth`, `authLocal` is `signIn.named`, `CliAuth` is `DeviceCode`; a Local Account is a Named Account and a Local Token a Name Token; better-auth's session is a Sign-in, and Session means only the app's.

Date: 2026-09-20

## Status

Accepted

## Context

A User with two Google accounts had to sign out and back in to move between them, and every First-Party web app on the Shared Cookie Domain followed whichever one was signed in last. Better Auth's `multiSession` plugin keeps one Session per signed-in User in the browser under its own cookie and rewrites the single session cookie when the User switches. It also changes what `/sign-out` does: with the plugin on it deletes every one of the browser's Sessions, not just the active one, and per-account sign-out is a separate endpoint. The alternative, letting each Consumer Backend pick its own account, would have meant a new credential shape in the `client` and `server` subpaths, which the toolkit promised not to change.

## Decision

The Auth Worker always runs `multiSession` as-is, with the account cap as `multiSession.maximumAccounts` (default 5). An opt-in flag was dropped: one code path for sign-out and the account switcher is simpler than two, and a browser with one Signed-in Account behaves as before apart from where sign-out lives. The Active Account is the one the session cookie names, so an Account Switch on any Auth Worker page changes the User for every First-Party web app on the Shared Cookie Domain at once, and for the Consent Screen and Device Screen. Sign-out follows the plugin: the public `client` subpath's `signOut` and the Home Page's "Sign out of all accounts" remove every Signed-in Account; signing out one account is only offered in the Auth Worker's account switcher. A browser holds at most one Signed-in Account per User: signing in again as an already signed-in User replaces that User's Session. Signing out an account removes it entirely; nothing remembers it.

## Consequences

The `client` and `server` subpaths, the schema, and the Migration Recipe are untouched: the plugin adds cookies with new names, Server-Side Verification already forwards the whole cookie header, and the refreshed-cookie relay keys by name. Consumer apps must tolerate the User changing under an open tab, exactly as they already had to when a User signed out and in elsewhere. The account switcher is a ui-toolkit block and appears on every Auth Worker screen. The Device Screen claims a code for whichever account looks it up, so it waits for the User to press Continue instead of looking up a prefilled code on load. The naming avoids Better Auth's "device session", which would collide with Device Login.
