---
'@kstackz/auth-toolkit': patch
---

Initial release under the `@kstackz` scope.

One Cloudflare Worker owns sign-in, sign-out, and sessions, built on better-auth and D1. It includes React session hooks for web apps, Device Login for CLIs, access tokens for MCP clients, and server-side checks for backends. You need it so every program asks one place "who is this?" instead of each one handling auth itself.

Subpaths are named for the program that imports them: `worker/*` for the Auth Worker and its Primary Database, `server/*` for a Consumer Backend, and `clients/browser` and `clients/cli` for First-Party programs. `rpc` and `http-api` are the Auth Cannotation declarations both sides share.
