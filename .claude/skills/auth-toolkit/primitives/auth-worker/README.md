# Auth Worker

One Cloudflare Worker running `createAuthWorker` on D1. It has two instances: production, deployed by GitHub Actions, and local, started with `pnpm dev`. Apps in every deployed stage use production; apps in local dev use local.

## Ask

Ask for the production host. Derive the local host by replacing its last label with `computer`, and show it. Suggest a Cookie Cache TTL of 300 seconds. Ask whether sign-in is limited to certain accounts. Confirm before creating files.

Everything else is derived per instance: the cookie domain is the host minus its first label, and every origin under it is trusted. The user can edit `infra/config.ts` later.

## Placeholders

| Placeholder                | Example                 |
| -------------------------- | ----------------------- |
| `__APP_NAME__`             | `auth`                  |
| `__APP_PATH__`             | `apps/auth`             |
| `__STACK_NAME__`           | `Auth`                  |
| `__PRODUCTION_HOST__`      | `auth.kishore.app`      |
| `__LOCAL_HOST__`           | `auth.kishore.computer` |
| `__PORTLESS_NAME__`        | `auth.kishore`          |
| `__COOKIE_CACHE_SECONDS__` | `300`                   |
| `__PRODUCTION_BRANCH__`    | `main`                  |

## Files

Copy this folder to `apps/__APP_NAME__`. Copy `.github/workflows/deploy.yml` to `.github/workflows/__APP_NAME__-deploy.yml` at the repository root. Delete this README from the copy.

- `infra/config.ts`: the two hosts, the TTL, and how the rest derives.
- `infra/auth-worker.ts`: the Worker and its D1 database. Migrations ship with auth-toolkit and apply on deploy.
- `src/worker.ts`: `createAuthWorker` on D1.
- `src/worker.test.ts`: boots both instances on the in-memory Provider.

## Sign-in restriction

When asked, add `validateUser` to `createAuthWorker`. Return nothing to admit, or an error to reject. The description is shown to the user.

```ts
validateUser: ({ user }) => {
  if (!user.email?.endsWith('@example.com')) {
    return {
      error: 'email_not_allowed',
      errorDescription: 'Use your example.com Google account',
    };
  }
},
```

## Secrets

`AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Production reads them from repository secrets; local reads them from `.env`. Generate the secret once with `openssl rand -base64 32`. Rotating it signs everyone out.

Google's OAuth client must list both callback URLs: `https://<host>/api/auth/callback/google` for each instance.

## Laymos

Layers: `infra` (paths `infra`; `infra/auth-worker.ts` exposed; `infra/config.ts` shared and exposed) and `worker-entry` (paths `src`; `src/worker.ts`). Rule: `worker-entry` uses `infra`.

## Verify

`pnpm lint` and `pnpm test` pass. `pnpm dev` answers `https://<local host>/api/auth/ok` with 200. After CI deploys, the production host answers the same.
