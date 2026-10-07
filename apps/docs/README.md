# docs

Documentation site for the monorepo, with live demos of its workspace packages, published at docs.kishore.app.

## Big picture

The site is built with Fumadocs on TanStack Start. Docs pages come from MDX in
`content/docs` (today: `@kstackz/std-toolkit`) and a blog from `content/blog`. The build
prerenders every route to static HTML. A Cloudflare Worker serves the output,
plus a few `/api` routes for search and page source. It lives
at [docs.kishore.app](https://docs.kishore.app).

It also hosts the interactive demos under `/demos`, with their code in
`src/demos`. Each demo exercises a workspace package end to end:

- `@kstackz/ai-toolkit`: a chat playground over `@kstackz/ai-toolkit/rpc`, `@kstackz/ai-toolkit/table`
  and `@kstackz/ai-toolkit/client`.

The UI uses `@kstackz/web-platform`, tracing uses `@kstackz/effect-tracer` and
`@kstackz/flow`, and `@kstackz/rpc-toolkit` and `@kstackz/std-toolkit` sit underneath. The
infrastructure is declared with Alchemy in `alchemy.run.ts` and `src/infra`.

## Usage

### Run locally

`pnpm dev` starts the Alchemy dev server through Portless. Production
`docs.kishore.app` maps to local `https://docs.kishore.computer`.
`portless.json` supplies the name `docs.kishore`, using the shared Portless
proxy configuration. In a Git worktree, Portless adds the worktree prefix to
the hostname. Use the URL printed at startup. Portless must configure local
hostname resolution and trust its local TLS CA. Portless assigns `PORT`;
running `alchemy dev` directly fails without it.

```bash
pnpm --filter docs dev     # dev server
pnpm --filter docs lint    # fumadocs-mdx + tsc --noEmit + laymos lint
```

### Build

The build prerenders every route to static HTML.

```bash
pnpm --filter docs build   # build + prerender -> apps/docs/.output/public
```

### Deploy

Deploys go through Alchemy (`alchemy.run.ts`). Deployed stages (`prod`,
`demo`, `pr<N>`) refuse to reconcile unless `ALLOW_DEPLOY=true`, so a stray
local `alchemy deploy` cannot touch them. Directory-style `index.html` output
means deep links like `/docs/std-toolkit/eschema` resolve directly.

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
   - `https://docs.kishore.app/docs/std-toolkit` (std-toolkit overview)
   - `https://docs.kishore.app/docs/std-toolkit/eschema` (deep link)
