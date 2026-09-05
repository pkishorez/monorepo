# Infrastructure

Set up one shared production auth service. All deployments and infrastructure changes run through GitHub Actions on `main`; never deploy locally or create branch, preview, or development auth resources.

Inspect the project's package policy, Alchemy setup, workflows, and installed `auth-toolkit` resource helpers. Install `auth-toolkit`, Alchemy, and the dependencies required by their installed versions. Follow the current Alchemy API rather than copying an older deployment example.

Resolve the Cloudflare account, production auth URL, application origins, cookie domain, and provider credentials. Include local application origins that will use this service. Ask whether to enable the Better Auth dashboard and whether any sign-in restrictions are required. Reuse existing answers.

Define the worker, D1 database, and KV session store in Alchemy with stable production resource and stack identities. Use `d1PrimaryDatabaseResource` from `auth-toolkit/alchemy/d1` and `kvSessionStoreResource` from `auth-toolkit/alchemy/cf-kv`. The D1 helper includes the toolkit's migrations; preserve that wiring.

Compose `createAuthWorker` from `auth-toolkit/worker` with `d1PrimaryDatabase` from `auth-toolkit/database/d1` and `kvSessionStore` from `auth-toolkit/secondary/cf-kv`. Wire the resource bindings, production URL, auth secret, Google credentials, trusted origins, and cookie domain where needed. Keep secrets in the deployment secret configuration.

## Implementation files

Copy [alchemy.run.ts](alchemy.run.ts) and [src/worker.ts](src/worker.ts) into the auth application's root and `src` folder, preserving their relative paths. These files are the starting implementation; update them when the toolkit or Alchemy APIs change. Check compatibility with the target project's installed versions before copying.

`alchemy.run.ts` defines the production stack, D1, KV, custom domain, and worker bindings. It requires the `prod` stage and uses persistent Cloudflare state. `src/worker.ts` imports the inferred environment type and composes the D1 and KV adapters with `createAuthWorker`. Requests go through the toolkit's handler for auth routes and credentialed CORS.

Supply these values through the deployment workflow:

| Variable               | Purpose                                                        | Example                                                         |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `AUTH_DOMAIN`          | Auth worker custom domain in the configured Cloudflare account | `auth.example.com`                                              |
| `COOKIE_DOMAIN`        | Shared cookie domain for the applications                      | `.example.com`                                                  |
| `TRUSTED_ORIGINS`      | JSON array of allowed application origins                      | `["https://app.example.com", "https://local.example.com:5173"]` |
| `AUTH_SECRET`          | Stable auth secret, stored as a CI secret                      | Generate once and retain across deployments                     |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID                                         | The configured provider's client ID                             |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret, stored as a CI secret              | The configured provider's client secret                         |

`Config.redacted` values become worker secret bindings. `DB` and `KV` become resource bindings; the remaining values become application configuration. Configure Cloudflare credentials and Alchemy state access separately for CI. The local hostname assumes local DNS and HTTPS are configured as described in [Application setup](../setup/guide.md).

## Optional admission and dashboard

When requested, wire `validateUser` to restrict registration, account linking, and fresh sign-in. This is a service-wide admission rule. Endpoint permissions belong in [Usage](../usage/guide.md).

For example, this `createAuthWorker` option admits only company accounts:

```ts
validateUser: ({ user }) => {
  if (!user.email?.endsWith('@example.com')) {
    return {
      error: 'email_not_allowed',
      errorDescription: 'Use your example.com account',
    };
  }
},
```

For the optional dashboard, consult current official Better Auth dashboard instructions. Explain where to obtain its API key and where to configure the deployment secret, then pass it as `dashApiKey`. Leave dashboard integration disabled when it is not requested.

When enabled, add `BETTER_AUTH_API_KEY: yield* Config.redacted('BETTER_AUTH_API_KEY')` to the worker's Alchemy `env`, and `dashApiKey: env.BETTER_AUTH_API_KEY` to `createAuthWorker`. Supply the key through the matching CI secret.

## Deployment

Create a GitHub Actions workflow that deploys on pushes to `main`. Guard the deployment job with `github.ref == 'refs/heads/main'`, including any manual trigger. Pull requests may validate but must not deploy. Use one fixed production stage and persistent Alchemy state across runs. Serialize production deployments. Configure dependency installation, required builds, Cloudflare credentials, Alchemy state access, and worker secrets according to the installed tooling.

Document the exact repository secrets and external configuration still needed, including the provider callback URL derived from the worker's auth route. Check the workflow, bindings, migration wiring, and types without applying infrastructure locally.

Report configuration readiness separately from deployment success. Once CI has deployed, verify the auth URL and session behavior from an allowed application origin. Until then, name the remaining CI or credential steps. Application connection continues in [Application setup](../setup/guide.md).
