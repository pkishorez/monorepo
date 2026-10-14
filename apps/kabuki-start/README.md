# kabuki-start

A small site served by Kabuki Start that shows pending and failed screens on slow pages, published at start.kishore.app.

## Big picture

The example app for `@kestack/kabuki/start`: a Kabuki app that one Cloudflare
Worker draws and serves, with no entry, route table or RPC written by the app.
How Start works is in
[`packages/kabuki/docs/start.md`](../../packages/kabuki/docs/start.md), and the
Routes, Loaders and Render Modes in
[`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md).

It shows how a move looks while its Loaders run and when they break. Its
Loaders are slow on purpose:

- `/blog` loads at once. Opening a post takes a second: after 150ms the post's
  pending screen shows inside the blog, which stays.
- `/blog/broken` always breaks, and shows the app's failed screen.
- `/flaky` is a client place that takes a second and breaks half the time.
  The server sends its pending screen in the page; it has its own failed
  screen, whose link tries again.

Each page fades up into its slot, and shows a box that says its Render Mode,
whether the server drew it or the browser did, and whether its Input came with
the page or was fetched from `/_kabuki/load`. The backend is pretend.

## Usage

### Find your way around

The code is split by where it runs:

```
src/
  shared/       both sides
    routes.ts     every place, its Input and Render Mode
  client/       the app: drawn by the server, then run by the browser
    app.tsx       the root Actor, in the layout and the Document (Start's `app`)
    document.tsx  the <html> around the app
    pages/        one folder per place, nested as the Routes are, with their pending and failed screens
    components/   what the pages are drawn with: layout, nav, footer, page frame, screens, theme
  server/       the server only
    loaders.server.ts  one Loader per place, slow on purpose (Start's `loaders`)
    backend/      the pretend database, in the Worker's memory
  infra/        the Worker and its domain, declared with Alchemy
```

`vite.config.ts` names the platform and the two files Start reads:
`start({ platform: cloudflare(), app: 'src/client/app', loaders: 'src/server/loaders.server' })`.

### Run locally

```bash
pnpm --filter kabuki-start dev     # builds its workspace packages, then vp dev through Portless
pnpm --filter kabuki-start lint    # tsc --noEmit + laymos lint
pnpm --filter kabuki-start build   # client and Worker -> dist/client, dist/ssr
```

`pnpm dev` runs the Worker's `fetch` in Vite's Node server, with HMR and no
Cloudflare account. Portless gives it the name `kabuki-start.kishore`
(`portless.json`), served at `https://kabuki-start.kishore.computer`. Static
pages are cached only in a build: in dev every page is drawn.

### Deploy

```bash
pnpm --filter kabuki-start deploy        # your own stage, at its workers.dev URL
pnpm --filter kabuki-start deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```

Every pull request gets its own stage, `pr<N>`, deployed by
`.github/workflows/deploy-kabuki-start.yml` to `https://pr<N>-start.kishore.app`
and destroyed by `cleanup-kabuki-start.yml` when it closes; a push to `main`
deploys `prod` to `https://start.kishore.app`. The deployed stages (`prod`,
`demo`, `pr<N>`) refuse to deploy unless `ALLOW_DEPLOY=true`; any other stage
is served at its `workers.dev` URL. Alchemy keeps what each stage has deployed in
the Cloudflare state store for `prod`, `demo` and `pr<N>`, shared by CI and
anyone deploying them, and on disk in `.alchemy/state` for a personal stage
(`src/infra/state.ts`). Deploying needs Cloudflare credentials for
the account that owns the `kishore.app` zone.
