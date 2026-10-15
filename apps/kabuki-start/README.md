# kabuki-start

A small site served by Kabuki Start that shows every routing case: loading, nested and parallel pages, failures, redirects, preloads and reloads, published at start.kishore.app.

## Big picture

The example app for `@kestack/kabuki/start`: a Kabuki app that one Cloudflare
Worker draws and serves, with no entry, route table or RPC written by the app.
How Start works is in
[`packages/kabuki/docs/start.md`](../../packages/kabuki/docs/start.md), and
pages, Places, Loaders and Render Modes in
[`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md).

Every page is an Actor written with `Route.page`, and draws its own data from
`status`: loading, failed or ready. Its Loaders are slow on purpose, and its
lists long, so each case has something to show, one URL each, toured from
the home page:

| URL                                  | What it shows                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `/blog`, `/blog/pages-are-actors`    | Nested pages, static, in two panes: the list keeps its scroll as a post opens, and Back puts the post back where you read to. |
| `/teams/core/ada`                    | Parallel loading, dynamic: a team and its member load side by side, the member first.                                         |
| `/feed`                              | A client page that scrolls the window: open a post, press Back or reload, and the window goes back once the feed is drawn.    |
| `/blog/broken`, `/flaky`             | A Loader that breaks: the page says why, with Try again, inside its own box; `/flaky` is a client page, half the time.        |
| `/blog/missing`, `/nowhere`          | Not found: a Loader's, drawn inside the blog, and a URL's, drawn by the root page; both a `404`.                              |
| `/blog/moved`, `/posts/no-waterfall` | Redirects: a Loader's `302`, and an old address the Routes replace with a `308`.                                              |
| `/search?q=scroll`                   | A query its Loader reads: a new one loads again on the same page, the results shown meanwhile.                                |
| `/notes`                             | A page with States and a draft: Reload loads its data again, and the draft stays.                                             |
| `/preload`                           | Links that preload on hover, once in view, or never, to slow pages whose Views load lazily.                                   |

Each page is drawn in a box, nested as its pages are, whose left edge is the
color of its Render Mode: green static, amber dynamic, blue client, the only
three colors the site adds. Its header says its place and path, its Render
Mode, where its data is, whether the server drew it or the
browser did, and whether its data came with the page or was loaded in the
browser, and how long its Loader took. Kabuki's devtools open from the button
in the bottom-right corner, or Ctrl+/: the Timeline of every Message and the
Map of every Actor, its Places too. A new page slides in the way the move
went, with `motion`, still for anyone who asks for less motion. It works the
same on a phone: there the panes stack and the window scrolls. The backend is
pretend.

## Usage

### Find your way around

The code is split by where it runs:

```
src/
  shared/       both sides
    data/         the Schema of each page's data, and the Metadata helper
    pages/        one Route.page per page, nested as the URL is; routes.ts reads them into the Routes
  client/       the Views: drawn by the server, then run by the browser
    app.tsx       the root page's View, in the layout and the Document (Start's `app`)
    document.tsx  the <html> around the app
    pages/        one View per page, nested as the pages are
    components/   what the pages are drawn with: the Place frame, layout, nav, status, motion, theme
  server/       the server only
    loaders.server.ts  one Loader per page with data, slow on purpose (Start's `loaders`)
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
