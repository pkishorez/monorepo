---
'@kstackz/auth-toolkit': patch
---

Initial release under the `@kstackz` scope.

One Cloudflare Worker owns sign-in, sign-out, and sessions, built on better-auth and D1. It includes React session hooks for web apps, Device Login for CLIs, access tokens for MCP clients, and server-side checks for backends. You need it so every program asks one place "who is this?" instead of each one handling auth itself.
