# 16. Auth runs locally at two seams, joined by a Local Token

Date: 2026-10-06

## Status

Accepted.

## Context

An app could not run without Google and the Auth Worker: not on `localhost`, not at a link shared with someone outside, not under an agent or a browser test, and not with two Users at once unless someone owned two Google accounts. An app's backend can run anywhere, a Worker, a local server, or an RPC server inside the browser itself, so local auth must not care where it runs. The browser client was React hooks, which an Effect app cannot replace with another Layer, and it signed calls by wrapping `fetch`, which only an HTTP Protocol uses.

## Decision

Auth has two seams, each an Effect service with a live and a local Layer. On the client, `Auth` is the Signed-in Accounts: `authLive` asks the Auth Worker, and `authLocal` keeps Local Accounts in a StdTable (in memory unless given another adapter) and asks a `choose` effect who signs in. On a Consumer Backend, `Authz.Resolver` already was the seam: `resolverLive` asks the Auth Worker, and `resolverLocal` reads the User straight out of a Local Token.

A Local Token carries the User it names, so the two sides never share state or talk to each other, and either can be used without the other's process. Everything between the seams, an app's Session signing, switching, and the Auth Cannotation, runs unchanged. `Authz.bearer` signs each guarded RPC call as one Session in a client middleware, so the same signing works over HTTP and over a Protocol with no transport at all. Which Layer an app provides, and where its backend runs, is the app's choice; the toolkit adds no flag.

The `clients/browser` hooks are removed. `clients/auth` replaces them; `signedFetch` stays for plain HTTP calls.

## Considered options

- **Test Login on the real Auth Worker**, issuing real Sessions for Test Accounts behind a secret. Rejected: it still needs a reachable Auth Worker, so a shared link or an in-browser backend cannot use it.
- **One emulated Auth Worker both sides talk to**, so signing out revokes a token. Rejected: the two sides would have to share state, which ties where the backend runs to where the browser runs.
- **A runtime `mock_auth` flag** in the toolkit. Rejected: choosing a Layer is already the switch, and a flag is one wrong setting away from a real backend that lets anyone in.
- **Making `Authz` a required client middleware.** Rejected: every app would have to provide signing, even one that signs with the cookie; Effect runs a client middleware only when it is provided, so `Authz.bearer` is opt-in.

## Consequences

`resolverLocal` accepts any Local Token, and signing a Local Account out revokes nothing on the backend: anyone may be anyone, which is why it must never guard a backend with real data. `authLocal` works wherever a StdTable adapter does, IndexedDB in a browser or SQLite on a phone. A live `signIn` leaves the page for Google and never completes; a local one completes, so callers check who is signed in after it either way.
