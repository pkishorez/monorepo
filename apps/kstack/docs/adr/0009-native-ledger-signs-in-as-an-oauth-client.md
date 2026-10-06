# Native Ledger signs in as an OAuth client

Status: accepted

Ledger on a phone signs Users in to the Remote Backend as a public OAuth
client of the shared sign-in service, with the authorization code flow and
PKCE, the way RFC 8252 asks native apps to. The Auth Worker already is that
OAuth server: better-auth's OAuth provider, with PKCE and refresh tokens, and
auth-toolkit already verifies its access tokens.

The app opens the sign-in service in the system's sign-in sheet, never in a
web view, so it never sees the Google password. The sign-in service redirects
back to the app's scheme with a one-time code, which is useless without the
secret the app kept. Each User gets a short-lived access token and a refresh
token that is replaced on every use, kept in the device's secure storage, and
revoked on Sign Out. The native app is a fixed, first-party client in the Auth
Worker's config: its redirects match exactly, `exp://` ones only on the dev
stage, and it skips the consent screen. The Remote Backend accepts these
access tokens beside session tokens, only with Ledger as their audience.

## Considered options

- **better-auth's Expo plugin and client.** Rejected: it carries the session
  cookie into the app and replays it, tying native to cookies just as each
  User is meant to hold their own tokens instead, on web too.
- **A custom handoff route that redirects with the session token.** Rejected:
  on Android another app can claim the scheme and read the token; PKCE is the
  standard answer to exactly that.
- **A client metadata document hosted by Ledger web.** Rejected: that is for
  clients the sign-in service does not know in advance, and a fixed list of
  redirects is tighter.

## Consequences

A public client cannot prove it is Ledger: another app can start its own flow
under Ledger's client id. The custom scheme carries this risk until Ledger
ships to the stores with https redirects claimed by the app (Universal Links,
App Links). An access token keeps working until it expires, up to its
lifetime after Sign Out.
