# docs

The docs for every ke stack package, a kabuki start app published at docs.kishore.app.

## Big picture

A kabuki start app, built the way
[`apps/kabuki-start`](../kabuki-start/README.md) is: every page is an Actor,
drawn by one Cloudflare Worker and hydrated in the browser. The home page
tells the stack as one scroll story over a WebGL particle field that takes a
shape for each stop: the monorepo, kabuki and its four parts, then what is
coming, the shapes alternating sides, with a comet that follows the scroll
and a rail that counts the stops. kabuki, the only package with docs so far, has a
landing page told the same way, and its docs under `/kabuki/<slug>`, with a
sidebar, "On this page" and a pager.

The table of contents is TypeScript, in `src/shared/content`: the packages,
and kabuki's sections and pages. Only written pages are in it. A page's slug
is its URL and is checked by the router, so a URL not in the table of
contents is a 404. A page's words are MDX, in `src/client/docs`, with its
pictures and its live app beside it. kabuki's pages are grouped by its four
Parts, core, react, routing and start, and every example on them is one of
three: a `Picture`, a `Live` app with the devtools a click away, or code that
`Run`s into a console.
How to write one is in [docs/authoring.md](./docs/authoring.md). The
full-screen demo, Opening an app, is at `/kabuki/demos/opening-an-app`, and
the sidebar opens it in a new tab; its drawing words are in
[`src/client/demos/opening-an-app/CONTEXT.md`](./src/client/demos/opening-an-app/CONTEXT.md).

MDX is compiled at build time by `@mdx-js/rollup`, with Shiki colouring the
code and `mdx/remark-docs.ts` giving headings their ids and including demo
files into code blocks. The UI uses `@kestack/web-platform`. The
infrastructure is declared with Alchemy in `alchemy.run.ts` and `src/infra`.

## Usage

### Find your way around

```
mdx/            the build step every page's MDX goes through
src/
  shared/       both sides
    content/      the packages, kabuki's table of contents, and each page's Metadata
    pages/        the page definitions; routes.ts reads them into the router
  client/       the Views: drawn by the server, then run by the browser
    app.tsx       the root page's View, in the layout and the Web Platform's Document
    docs/         every page: its MDX, its pictures and its live app
    pages/        one View per page: home, kabuki's landing, a docs page, the demo
    components/   the header, sidebar, theme, how MDX is drawn; examples/ holds Picture, Live, Run and Files
    field/        the particle field behind the home and kabuki landing pages, and the Stops its stories are told in
    demos/        the full-screen demo
  infra/        the Worker and its domain, declared with Alchemy
```

### Add a docs page

Follow [docs/authoring.md](./docs/authoring.md): add it to the table of
contents, write its MDX in its own folder, and register it.

### Run locally

`pnpm dev` first builds the workspace packages the docs app depends on, so the
demos import their current `dist` output. It then starts the plain Vite dev
server through Portless: no Cloudflare account, credentials or Alchemy state
are involved, because the Worker uses no Cloudflare bindings. Alchemy is only for deploys. Production
`docs.kishore.app` maps to local `https://docs.kishore.computer`.
`portless.json` supplies the name `docs.kishore`, using the shared Portless
proxy configuration. In a Git worktree, Portless adds the worktree prefix to
the hostname. Use the URL printed at startup. Portless must configure local
hostname resolution and trust its local TLS CA, and it passes the port to
Vite.

```bash
pnpm --filter docs dev     # dev server
pnpm --filter docs lint    # tsc --noEmit + laymos lint
pnpm --filter docs test    # the demo's stories, and every link between pages
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
3. The custom domain is declared by the Web Platform's `Site`
   (`@kestack/web-platform/app/alchemy`) in `src/infra/website.ts`, so the
   deploy binds it. Cloudflare provisions the DNS record and TLS cert because
   the `kishore.app` zone already exists in the account. No dashboard steps.
4. Verify in a browser once DNS and TLS propagate (usually under a minute):
   - `https://docs.kishore.app/` (landing page)
