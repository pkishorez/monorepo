# 19. Browser callers are same-site and never hold tokens

Date: 2026-10-19

## Status

Accepted. Supersedes [ADR 0014](./0014-first-party-apps-may-switch-and-act-as-an-account.md).

## Context

ADR 0014 let a web app read every Account's Sign-in token from `list-device-sessions` and send one as a bearer, so a tab could act as an Account other than the Active Account, and so a per-User local copy (Std Sync) could not be written to by the wrong User after a switch in another tab. That put Sign-in tokens in page JavaScript, where any cross-site scripting can take them, and it let a web app on another site sign in at all.

## Decision

A Browser caller is a web app on the Shared Cookie Domain, and its only credential is the Auth Worker's cookie, which page code never reads. The client lists Accounts without their tokens; every tab acts as the Active Account; a web app on another site is not served. `cookieDomain` is required and is the trust rule: any origin under it is trusted, and `trustedOrigins` is gone.

To keep a per-User copy safe without a token, every Browser call carries an `expect-user` header naming the User the client believes is active. A header is a claim, not a credential. When the cookie's Active Account is someone else, the backend refuses the call with Account Changed, and the client's `Accounts` re-checks. A BroadcastChannel tells other tabs about a switch at once; the header is what holds when that message is late.

## Considered options

- **Keep bearer tokens in the browser** (ADR 0014). Rejected: XSS exposure, and it is the only reason a cross-site web app could sign in.
- **An account selector header**, letting a tab pick any Account from the multi-session cookie. Rejected: per-tab Accounts add a second notion of "active" to explain, for a need no app has.
- **Rely on the BroadcastChannel alone.** Rejected: a late message lets one sync write a different User's data.

## Consequences

Backends serving Browser callers must sit under the Shared Cookie Domain and receive cookies on every call, WebSocket upgrades included, so the `?access_token=` workaround goes. Device and OAuth callers are unaffected: they still send bearers. The Auth Worker's own Device Screen and Consent Screen are the one place an Account other than the Active Account is used: the worker approves as the Approving Account with that Account's session on the server, so nothing switches and no token reaches the page.
