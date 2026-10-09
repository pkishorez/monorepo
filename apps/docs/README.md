# docs

Live demos of the monorepo's packages, published at docs.kishore.app.

## Big picture

A plain TanStack Start app. The home page lists the demos, and each demo opens
on its own page under `/demos`, with its code in `src/demos`. Today there is
one: `effect-oak`, an auth gate and a todo list built as one tree of Effect Oak
Nodes, with its Message Log beside it.

The UI uses `@kstackz/web-platform`. A Cloudflare Worker serves the site, and
the infrastructure is declared with Alchemy in `alchemy.run.ts` and
`src/infra`.

### Add a demo

Put its code in `src/demos/<name>`, add a route at
`src/routes/demos/<name>.tsx`, list it in `demos` in `src/routes/index.tsx`,
and allow the route to import it in `laymos.config.json`.

## Usage

### Run locally

`pnpm dev` starts the plain Vite dev server through Portless: no Cloudflare
account, credentials or Alchemy state are involved, because the Worker uses no
Cloudflare bindings. Alchemy is only for deploys. Production
`docs.kishore.app` maps to local `https://docs.kishore.computer`.
`portless.json` supplies the name `docs.kishore`, using the shared Portless
proxy configuration. In a Git worktree, Portless adds the worktree prefix to
the hostname. Use the URL printed at startup. Portless must configure local
hostname resolution and trust its local TLS CA, and it passes the port to
Vite.

```bash
pnpm --filter docs dev     # dev server
pnpm --filter docs lint    # tsc --noEmit + laymos lint
```

### Build

```bash
pnpm --filter docs build   # build -> apps/docs/dist
```

### Deploy

Deploys go through Alchemy (`alchemy.run.ts`). Deployed stages (`prod`,
`demo`, `pr<N>`) refuse to reconcile unless `ALLOW_DEPLOY=true`, so a stray
local `alchemy deploy` cannot touch them.

Normal path: `.github/workflows/deploy-docs.yml`. Pushes to `main` deploy
`prod` at `docs.kishore.app`. Pull requests deploy `pr<N>` previews at
`pr<N>-docs.kishore.app` and destroy them when the PR closes. The workflow can
also be dispatched by hand with a stage of `prod`, `demo` or `pr<N>`.

Manual path, for a one-off prod deploy from your machine:

```bash
pnpm --filter docs deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```

First-time setup, once per Cloudflare account:

1. Have Cloudflare credentials in the environment (`CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`) for the account that owns the `kishore.app` zone.
   The deploy also needs AWS credentials; see `deploy-docs.yml` for the
   full list.
2. Run the first deploy. It creates the Worker and the state store, and uploads the assets.
3. The custom domain is declared in `src/infra/stage.ts` (`domainFor`), so the
   deploy binds it. Cloudflare provisions the DNS record and TLS cert because
   the `kishore.app` zone already exists in the account. No dashboard steps.
4. Verify in a browser once DNS and TLS propagate (usually under a minute):
   - `https://docs.kishore.app/` (landing page)
   - `https://docs.kishore.app/demos/effect-oak` (a demo)
