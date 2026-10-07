# 11. Auth screens are pure ui-toolkit blocks; auth-toolkit only wires data

> Names changed since this was written ([ADR 0005](../../../../docs/adr/0005-three-toolkits-three-doors.md)): the doors are now `worker`, `worker/memory`, `worker/alchemy`, `guard`, `server`, `server/cloud`, `client`, `client/web`, `client/expo` and `client/cli`; Cannotation is Middleware; `CurrentAuth` is `Authz.Current`, `VerificationUnavailable` is `Authz.Unavailable`; `authzLayer` is `authz.layer`, `authzCookies` is `authz.cookies`, `resolverLive` is `authz.cloud`, `resolverLocal` is `authz.device`; the `Auth` service is `SignIn`, `authLive` is `cookie` (from `client/web`), `authExpo` is `oauth`, `authLocal` is `signIn.named`, `CliAuth` is `DeviceCode`; a Local Account is a Named Account and a Local Token a Name Token; better-auth's session is a Sign-in, and Session means only the app's.

Date: 2026-09-19

## Status

Superseded by the monorepo's [ADR 0003](../../../../docs/adr/0003-web-toolkit-and-the-gate.md): ui-toolkit is gone, and auth-toolkit never imports web-toolkit, so the screens are owned copies in `src/auth-worker/ui`. That auth-toolkit only wires data to them still holds.

## Context

The Auth Worker serves four screens: Home Page, Login Screen, Consent Screen, and Device Screen. Each has several states (loading, signed out, signed in, error, done) and the states must not shift layout as they change. Until now each screen mixed the better-auth client, effects, and markup in one component inside auth-toolkit, which has no visual test harness. Layout shifts went unnoticed because no state could be rendered on its own, and the only way to see a state was to reproduce it against a running Auth Worker.

ui-toolkit already has react-cosmos fixtures for every block, one fixture entry per state. auth-toolkit depends on ui-toolkit; ui-toolkit imports nothing from auth-toolkit.

## Decision

Every visual of the four screens lives in ui-toolkit as the `auth` block: the frame, the loader, and each screen with all of its states, as pure components. Props in, callbacks out. Nothing under the block imports better-auth, TanStack Query, or the router. Each screen ships a fixture file with one entry per state.

auth-toolkit keeps every fact: the session hook, the queries and mutations for Sessions and Grants, the redirect rules between Home Page and Login Screen, and the calls to the Auth Worker. Its route components pass data and handlers into the block.

## Consequences

Every state of every screen is renderable without a server, so layout-shift regressions are visible in the fixture browser. Auth-specific copy and layout now live in a UI kit, which a reader may find surprising; this file is the answer. A change that needs a new screen state touches both packages: the block for the visual, auth-toolkit for the data. The block cannot know whether a User is signed in; it can only be told.
