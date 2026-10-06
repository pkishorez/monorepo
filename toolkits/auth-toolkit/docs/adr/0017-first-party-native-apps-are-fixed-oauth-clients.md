# 17. First-Party native apps are fixed OAuth clients

Date: 2026-10-07

## Status

Accepted. Narrows ADR 0010: First-Party programs still hold Sessions, except
native apps.

## Context

A native app cannot share the browser's session cookie, and Device Login
(ADR 0010) asks a User to type a code on another screen, which is wrong on
the phone they are holding. RFC 8252 says a native app signs in as a public
OAuth client with the authorization code flow and PKCE, in the system's
sign-in sheet. Better Auth's Expo plugin instead carries the session cookie
into the app, which ties the app to cookies just as each User is meant to
hold their own credential. Ledger is the first such app (Ledger ADR 0009).

## Decision

A First-Party native app is a First-Party Client: an OAuth client the
deployment lists in `authorizationServer.firstPartyClients`, not one that
registers itself. It is public, must use PKCE, never sees the Consent
Screen, may use only its exact redirect URIs (its own scheme is fine), and
brings its own Resource Server, which only it may get Access Tokens for.
Its stored client record is written from the config on first use and
rewritten when the config changes, so the config is the only place it is
set. Its Access Tokens are short (15 minutes by default) and refresh tokens
turn over on every use; a spent one presented again revokes that client's
tokens for the User, which Better Auth's provider already does. The app's
backend accepts the Access Token as a Resource Server, by its audience.

A Test Sign-In, for agents and tests, signs in anyone with a `.test` email
on the `local` stage only; the Auth Worker refuses to start with it on any
other stage.

## Consequences

The First-Party/Third-Party split no longer fixes the credential: a
First-Party Client holds Access Tokens, as a Client Application does, but it
is configured by the deployment and never asked to consent. A public client
cannot prove who it is: another app can start a flow under its client id,
and on Android claim its custom scheme, until the app ships with https
redirects it owns (Universal Links, App Links). An Access Token keeps
working up to its lifetime after Sign Out. Reuse detection revokes the
client's tokens for the User on every device, not just the one chain. A web
app could later move to the same model; then the Session-token path on
Resource Servers would go.
