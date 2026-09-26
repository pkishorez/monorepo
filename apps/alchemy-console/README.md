# alchemy-console

Web console for browsing Alchemy state stores and deleting stacks, stages and resources with user-owned provider credentials.

## Big picture

Alchemy records what it deployed in a state store. Reading that state, or
tearing down a stage, otherwise means running the CLI with the right
credentials on your machine. The console puts the same operations behind a
login at [console.kishore.app](https://console.kishore.app): pick a store, walk
its stacks and stages, inspect resources, actions and outputs, and delete a
stage after a review that shows what will happen to every resource.

Credentials belong to the user, not the app. A user registers Cloudflare or AWS
credentials once in Settings, grants them to stores, and chooses which one
each deletion runs with. The vocabulary (store, grant, stage, deletion review,
ignore a resource) is defined in [CONTEXT.md](./CONTEXT.md). The folder layout
and layer graphs are in [ARCHITECTURE.md](./ARCHITECTURE.md), with decisions in
[docs/adr](./docs/adr).

It is a TanStack Start app on a Cloudflare Worker with a D1 database, declared
in `alchemy.run.ts`. It builds on `auth-toolkit` for login, `rpc-toolkit` for
the typed client to server API, `std-toolkit` for the SQLite table layer and
schemas, `kui-toolkit` and `use-effect-ts` for the UI, and
`@pkishorez/effect-tracer` for telemetry. The deletion engine runs Alchemy's
own `Plan.destroy` inside the Worker.

## Usage

### Run locally

`pnpm dev` starts the Alchemy dev server through Portless, which assigns
`PORT` and serves the app under the `console.kishore` name from
`portless.json`. Use the URL printed at startup. `alchemy.run.ts` creates the
local D1 database and runs `D1.table` to set up the console table.

```bash
pnpm --filter alchemy-console dev          # dev server
pnpm --filter alchemy-console dev:force    # nuke local Alchemy state, then dev
pnpm --filter alchemy-console lint         # vp check + tsc --noEmit + laymos lint
pnpm --filter alchemy-console fmt
pnpm --filter alchemy-console test         # vitest, tests/*.test.ts
pnpm --filter alchemy-console test:worker  # bundles the Worker with esbuild, runs it under Miniflare
```

### Build

```bash
pnpm --filter alchemy-console build        # vp build -> dist/
```

### Deploy

Deploys only run in GitHub Actions. `alchemy.run.ts` throws when the stage is
`prod` or `pr<N>` and `CI` is not `true`, so a local `alchemy deploy` cannot
reach a deployed stage.

`.github/workflows/deploy-alchemy-console.yml` deploys `prod` to
`console.kishore.app` on every push to `main`, and `pr<N>` to
`pr<N>-console.kishore.app` for each pull request. It needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, runs
`alchemy cloudflare bootstrap` once, then `alchemy deploy --stage <stage>`.
The `D1.table` resource checks the console table snapshot and sets up the
`alchemy-console` table in the new `alchemy-console-v3-<stage>` database. The
previous database is removed during the deployment; its records are not
copied. PR stages are removed by
`cleanup-alchemy-console.yml`.
