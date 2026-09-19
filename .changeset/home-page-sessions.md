---
'auth-toolkit': patch
'kui-toolkit': patch
---

The Auth Worker's pages are rebuilt on a new kui-toolkit `auth` block, with one width, one loader, and no layout shifts. `/` is now the Home Page: a signed-in User sees every Session on their account and every app they allowed, and can revoke any of them. Revoking an app also revokes its refresh tokens. `/login` only signs in, and every other page sends a signed-out visitor there and back. `CliAuth.layer` takes an optional `version`, and the CLI names itself `<app>/<version>` so its Session is recognisable on the Home Page. When the Auth Worker is down or unreachable, the CLI now fails with `AuthWorkerUnreachable` and a plain message instead of a raw HTTP error. Better Auth errors now redirect to a branded Error Screen at `/error` instead of Better Auth's default page, and unknown paths show a branded Not Found screen.
