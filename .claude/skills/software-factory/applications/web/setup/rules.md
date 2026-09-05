# Setup rules

## URLs and Portless

- Production: `https://hello.x.com`
- Local: `https://hello.local.x.com`
- Preview: `https://pr<N>-hello.x.com`
- Insert `local` before the owned domain. Ask only if the domain is unclear.
- The [Alchemy template](templates/common/alchemy.run.ts) computes deployed hostnames from the stage.
- Set `__LOCAL_HOST__` without a scheme or port.
- Use `portless run --force alchemy dev`; Portless reads the name from `portless.json` and adds the current worktree prefix. Include that prefix in the reported local URL and allow it in Vite's host configuration.
- Check existing proxy suffixes, aliases, port, and TLS once. Use `portless get __PORTLESS_NAME__` for a read-only URL lookup; the primary suffix may differ from the owned-domain alias.
- Set `__PORTLESS_NAME__` in [portless.json](templates/common/portless.json) without the proxy suffix: `todos.local.kishore.app` becomes `todos.local.kishore` when the suffix is `.app`.
- Use HTTPS without a port in the browser URL. Portless assigns the internal app port.
- Preserve other apps’ proxy settings.
- Explain any DNS, TLS, or proxy changes needed for local testing.

## Workspace and dependencies

- Reuse existing root scripts, pnpm settings, catalog entries, and package versions.
- Use `workspace:*` for internal dependencies and `catalog:` for external dependencies.
- Add only dependencies the app needs.
- Keep package scripts direct.
- Use [monorepo examples](templates/README.md) only to fill gaps.
- Follow `configure-syncpack` when changing dependency policy.

## Files and templates

- Follow [web architecture](../architecture.md) and [shared architecture](../../../core/architecture.md) for file placement.
- Replace all placeholders.
- Make imports match the installed APIs.

## DynamoDB

- Reuse DynamoDB Local at `http://localhost:8090`.
- If unavailable, tell the user it must be running for local testing.
- Do not add another Docker instance or port.
- Create the local table during application startup.
- Give new STD tables primary keys and at least four GSIs.
- Leave business entities and schemas undefined.

## Secrets and deployment

- Keep credentials in server configuration and GitHub secrets.
- Use separate resources for production and each PR.
- PR cleanup must delete only that PR’s resources.
- Keep workflows direct and use the monorepo’s actual lint and build commands.
- Include a deployment summary.

## Checkpoints

- Stop after generating files for the first review.
- Run automated checks in GitHub Actions after local acceptance.
- Confirmed user choices override template defaults.
