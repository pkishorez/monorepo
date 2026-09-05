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

## UI and Tailwind

- Include `kui-toolkit` in every web app. Use `workspace:*` when the package exists in the target workspace; otherwise add its published version to the default pnpm catalog and use `catalog:`. If it has not been published yet, report the missing dependency instead of inventing a registry version.
- Apply the common [Vite config](templates/common/vite.config.ts) and [stylesheet](templates/common/src/styles.css): Tailwind v4's Vite plugin compiles CSS, and `ssr.noExternal` compiles the toolkit's TS/TSX during server rendering. Merge these settings into existing configuration.
- Keep Tailwind configuration in `src/styles.css` using `@theme`, `@source`, and CSS token overrides. This setup needs no `tailwind.config.js` or separate PostCSS config. The toolkit global stylesheet supplies Tailwind, animations, typography, theme tokens, and its own source registration.
- Load `styles.css?url` through the root route's stylesheet link. Both common and Durable Object root templates preserve this link. Use semantic colors such as `bg-background`, `text-foreground`, and `text-muted-foreground` so the toolkit theme applies consistently.
- Import components from `kui-toolkit/components/ui/*`; install optional peers only for specialized blocks that need them. Keep application styles and overrides in the app stylesheet.

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
