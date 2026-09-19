# 10. Device Login is a First-Party Session, not the OAuth device grant

Date: 2026-09-19

## Status

Accepted

## Context

A CLI has no browser, so it cannot receive the session cookie a web app gets. Better Auth offers two ways to sign a device in through a code the User approves in a browser: `deviceAuthorization` from `better-auth/plugins`, which ends in a plain Session token, and `oauthDeviceAuthorization` from `@better-auth/oauth-provider`, the RFC 8628 grant, which ends in an OAuth Access Token bound to a registered Client Application, a resource, and Scopes. The toolkit first wired the OAuth grant, because the Authorization Server Role already existed and the grant belongs to it. The result was that signing our own CLI in looked like consenting to a third party: a client id to register, Scopes to grant, a consent-shaped page, and a `resource` opt-in on every backend the CLI called.

## Decision

Device Login uses `deviceAuthorization` and the `bearer` plugin under the always-on Identity Role, and the OAuth device grant is not offered. A CLI is First-Party: it obtains a Session, the same credential a browser holds, sent as a bearer instead of a cookie. On a Resource Server, Server-Side Verification first verifies a bearer as an Access Token and, when that fails, asks the Auth Worker whether it is a Session; a backend without a resource checks only for a Session. Credential type is established by successful verification rather than token shape. Every Consumer Backend therefore accepts a CLI with no opt-in, no registration, and no Scopes, and the device page is a sign-in page, served on every deployment.

## Consequences

The First-Party versus Third-Party split becomes the one distinction that decides role and credential: web apps and CLIs are Identity Role and Session, MCP clients and other third parties are Authorization Server Role and Access Token. The `device_code` table loses the two columns the OAuth grant added; one migration drops them. A Third-Party program on a headless host that needs the OAuth device grant is not served; if that need arrives, the grant can be added back beside `deviceAuthorization` as a separate feature of the Authorization Server Role without touching Device Login.
