# 17. Native apps sign in with Device Login

Date: 2026-10-07

## Status

Accepted.

## Context

A native app built with Expo is First-Party, but it has no cookie jar it
shares with the Auth Worker. better-auth offers `@better-auth/expo`, which keeps
one session cookie per app in secure storage and returns it through a deep
link; the OAuth Authorization Server Role offers the authorization code grant
with PKCE. Several Users may be signed in on one phone at once, and a Consumer
Backend already accepts a Session as a bearer (ADR 0010).

## Decision

A native app obtains each User's Session through Device Login, as a CLI does.
It opens the Device Screen in an in-app browser with the code filled in, the
User signs in, picks the account and presses Continue, and the app receives the
Session token by polling over HTTPS. The Session Store on a native app is the
device's secure storage, readable only while the device is unlocked and never
backed up. Signing a User out revokes that Session on the Auth Worker.

## Considered options

- **`@better-auth/expo`.** Rejected: one cookie per app does not hold several
  Users, and it moves away from every First-Party client holding one Session
  token per User.
- **OAuth authorization code with PKCE.** Rejected, though secure: it treats
  our own app as a Third-Party (Client Registration, Scopes, consent), every
  Consumer Backend would have to become a Resource Server, refresh tokens would
  need storing and rotating, and an Access Token verified against JWKS outlives
  sign-out until it expires.
- **A custom code hand-off over a `ledger://` deep link.** Rejected: new
  security-sensitive endpoints, when Device Login already does the job.

## Consequences

No deep link, app scheme, or Trusted Origin is involved, so the flow works in
any development build. A Session token is long-lived where an Access Token
would expire in minutes, which is why it is kept only in secure storage and
revoked on sign-out. Device Login's known weakness is a User approving a code
someone else started, so the Device Screen names the program asking and keeps
its Continue step. Device codes must expire within minutes and the Auth
Worker's sign-in and device endpoints must be rate limited.
