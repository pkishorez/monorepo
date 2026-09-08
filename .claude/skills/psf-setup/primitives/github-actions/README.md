# GitHub Actions

Deploys the app's `prod` stage on pushes to the production branch and a `pr<N>` preview for every pull request from this repository, then destroys the preview when the PR closes. Pick this when the app has a production host; skip it for local-only experiments.

Requires `application`. Deployed stages refuse to run without `ALLOW_DEPLOY=true`, which only these workflows and `pnpm deploy:prod` set.

## Files

Copy to the repository root, one pair per app:

- `.github/workflows/deploy.yml` as `.github/workflows/__APP_NAME__-deploy.yml`
- `.github/workflows/cleanup.yml` as `.github/workflows/__APP_NAME__-cleanup.yml`

## Placeholders

| Placeholder             | Example             |
| ----------------------- | ------------------- |
| `__APP_NAME__`          | `hello`             |
| `__APP_PATH__`          | `apps/hello`        |
| `__STACK_NAME__`        | `Hello`             |
| `__PRODUCTION_HOST__`   | `hello.kishore.app` |
| `__PRODUCTION_BRANCH__` | `main`              |

Node version and action versions match the repository's existing workflows; update them together.

## Secrets

Repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Storage primitives list the secrets they add.

## Verify

The PR run ends with a summary line `pr<N> deployed: https://pr<N>-<host>` and the preview shows the greeting. Closing the PR runs cleanup with `Preview destroyed.` in its summary.
