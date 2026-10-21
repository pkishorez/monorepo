# kabuki-start

The smallest Kabuki Start app, the one to copy: static, dynamic and client pages layered on one screen, links that preload on hover, and two API Workers with a public, an authenticated and an authorized call each, published at start.kishore.app.

## Big picture

The blueprint for an app on `@kestack/kabuki/start`: a Kabuki app that one
Cloudflare Worker draws and serves, beside API Workers of its own, each
declared with Alchemy. How Start works is in
[`packages/kabuki/docs/start.md`](../../packages/kabuki/docs/start.md), and
pages, Places, Loaders and Render Modes in
[`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md).

Three screens. **Rendering** (`/`) is a static page; `/dynamic` adds a
dynamic layer inside it, and `/dynamic/client` a client layer inside that,
so all three Render Modes share one screen. A URL names one page per level,
so nesting is how they do; `/` alone stays all static, which is what lets a
build keep it for everyone. Each layer says, from its `status.info`, who
drew it, when its Loader ran, how its data arrived and whether it is cached.
**Preloading** (`/items`, `/items/:id`) is a list and the item it opens: each
link shows its preload as it happens, read from the real `/_kabuki/load`
request, and the item says whether it opened at once or after a wait; its
copy stays fresh for 30 seconds, and `/items/9` is not found. The header's
Account Switcher (web-platform's `account-switcher`) signs in, switches and
signs out with the Auth Worker (auth-toolkit's cookie mode,
[`toolkits/auth-toolkit/README.md`](../../toolkits/auth-toolkit/README.md)),
and every page reads who is signed in from it. **APIs** (`/apis`) says who
its calls go as and calls two Workers, one serving an Effect `HttpApi` and one an Effect
RPC group, showing each request and what came back. Each has three calls,
one per level of access (`src/apis/access`): **public**, for anyone;
**authenticated** (`Authz.required`), for any signed-in Account, refused
401 Unauthenticated otherwise; and **authorized** (`Authz.policy`), for
`kishore.iiitn@gmail.com` alone, refused 403 Forbidden to anyone else.

The folders are its boundaries. `src/shared/pages` is what both sides
import: every page's definition and build, its data Schema, and the router.
`src/client` is the browser's (drawn by the server too), `src/server` the
server's alone, and each `src/apis/<name>` one API Worker: its contract, its
entry (`worker.server.ts`, which the browser can never import) and the
client the browser calls it with; `src/apis/access` is the rule both Workers
apply. `laymos.config.json` says who may import
whom. The browser learns each Worker's URL from the site's `VITE_*` env,
which Alchemy sets from the Workers it declares and Vite inlines.

## Usage

### Find your way around

```
src/
  shared/pages/        both sides: one file per page, its data Schema beside it; pages.ts holds the root page and the router
  client/
    app.tsx            Start.app: the router, the root View, the Document, the browser's Layer (Accounts and both API clients)
    document.tsx       the <html> around the app: theme script, devtools, sign-in dialog
    views/             one View per page; views.tsx draws the root page, preload-link.tsx shows a preload live
    components/        layout, page intro, clock, devtools, theme
  server/
    loaders.server.ts  Start.server(loaders): one Loader per page with data
  apis/
    hello-http/        the HTTP API Worker: contract.ts, worker.server.ts, hello-http.ts (the browser's client)
    hello-rpc/         the RPC API Worker, the same shape
    access/            who may call what: the three levels, the owner, its Policy
    pocket/            the Pocket Worker: each Account's wallets and entries in a D1 std Table, and the browser's client
  infra/               the site, the API Workers and their domains, declared with Alchemy
```

`vite.config.ts` names the platform and the two files Start reads:
`start({ platform: cloudflare(), app: 'src/client/app', loaders: 'src/server/loaders.server' })`.

### Run locally

```bash
pnpm --filter kabuki-start dev     # builds its workspace packages, then alchemy dev through Portless
pnpm --filter kabuki-start lint    # tsc --noEmit + laymos lint
pnpm --filter kabuki-start test    # each API Worker answered in-process, Pocket on D1 in Miniflare
pnpm --filter kabuki-start build   # client and Worker -> dist/client, dist/ssr
```

`pnpm dev` runs `alchemy dev` through Portless: the site in workerd under
Vite, with HMR, at `https://kabuki-start.kishore.computer` (`portless.json`),
and the API Workers on ports 4581, 4582 and 4583, which the script names to
Portless as `https://hello-http-start.kishore.computer`,
`https://hello-rpc-start.kishore.computer` and
`https://pocket-start.kishore.computer`. Sign-in needs every host under
the session cookie's domain, so in dev it uses the Auth Worker at
`https://auth.kishore.computer`, which must be running; deployed, everything
is under `.kishore.app` and signs in with `https://auth.kishore.app`
(`src/infra/stage.ts`). Each API Worker lets only the site's origin call it
with credentials. A personal stage keeps its state in `.alchemy/state`.
Static pages are kept only in a deployed build: in dev every page is drawn.

### Deploy

```bash
pnpm --filter kabuki-start deploy        # your own stage, at its workers.dev URLs
pnpm --filter kabuki-start deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```

Every pull request gets its own stage, `pr<N>`, deployed by
`.github/workflows/deploy-kabuki-start.yml` to `https://pr<N>-start.kishore.app`,
with its Workers at `https://pr<N>-hello-http-start.kishore.app` and
`https://pr<N>-hello-rpc-start.kishore.app`, and destroyed by
`cleanup-kabuki-start.yml` when it closes; a push to `main` deploys `prod` to
`https://start.kishore.app`. The deployed stages (`prod`, `demo`, `pr<N>`)
refuse to deploy unless `ALLOW_DEPLOY=true`. A personal stage deployed to
`workers.dev` is served, but signs nobody in. Their state is in the
Cloudflare state store (`src/infra/state.ts`). Deploying needs Cloudflare
credentials for the account that owns the `kishore.app` zone.
