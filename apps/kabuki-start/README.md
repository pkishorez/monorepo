# kabuki-start

A small site served by Kabuki Start, with a page for every Render Mode, published at start.kishore.app.

## Big picture

The example app for `@kestack/kabuki/start`: a Kabuki app that one Cloudflare
Worker draws and serves, with no entry, route table or RPC written by the app.
How Start works is in
[`packages/kabuki/docs/start.md`](../../packages/kabuki/docs/start.md), and the
Routes, Loaders and Render Modes in
[`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md).

Every place in `src/shared/routes.ts` covers one case: static pages with and without
an Input, nested static places whose Loaders run at once, a dynamic account
read from a session cookie whose Loader redirects to sign-in, client places
under static and dynamic ones, a dynamic cart under the static shop, lazy Views
on `/dashboard` and `/docs/playground`, a redirect in the Routes and the
not-found Route. Each place shows a box that says its Render Mode, whether the
server drew it (when, and with which build) or the browser did, and whether its
Input came with the page or was fetched from `/_kabuki/load`. Each fact has a
`data-` attribute for tests.

The backend is pretend, and so is signing in: anyone can be anyone, by name.
The Loaders use Start's tiers: the backend is the instance tier, made once,
and the visitor the visitor tier, made from each request for the dynamic and
client places alone.

## Usage

### Find your way around

The code is split by where it runs:

```
src/
  shared/       both sides
    routes.ts     every place, its Input and Render Mode
    visitor.ts    who is visiting, kept in cookies the browser writes and the server reads
  client/       the app: drawn by the server, then run by the browser
    app.tsx       the root Actor, in the layout and the Document (Start's `app`)
    document.tsx  the <html> around the app
    pages/        one folder per place, nested as the Routes are
    components/   what the pages are drawn with: layout, nav, footer, page frame, theme
  server/       the server only
    loaders.server.ts  one Loader per place, and the tiers they Require (Start's `loaders`)
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

### Check every page end to end

```bash
pnpm --filter kabuki-start stories                    # every Proof, against vp dev at http://localhost:4317
pnpm --filter kabuki-start stories kabuki-start/moves # one Story, or one Proof by its id
KABUKI_START_URL=https://kabuki-start-you.workers.dev pnpm --filter kabuki-start stories
```

The Stories in `stories/` check each page of the site from outside, as
Laymos Proofs: status codes, redirects, Cache-Control and the HTML the
server sends, with `fetch`; hydration, clicks, Back and Forward, the requests
to `/_kabuki/load`, Metadata after moves and the theme before the first paint,
in Chromium. They run against `KABUKI_START_URL`, or `http://localhost:4317`
when it is unset, so start `pnpm --filter kabuki-start exec vp dev --port 4317`
first, or point them at a deployed stage. Run against `vp dev`, the Proofs about caching expect what dev
does, which is to keep nothing. Each run writes its Evidence, with screenshots
and a recording per tab, to `.laymos/stories/`.

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
