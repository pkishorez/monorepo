# pwa-playground

A field guide to PWAs that runs live: one playground per pwa-toolkit and use-gesture capability, published at pwa.kishore.app.

## Big picture

`@kstackz/pwa-toolkit` turns a TanStack Start app into a PWA, and
`@kstackz/use-gesture` gives it native-feeling touch. This app is where both
are exercised in a real browser, and where the evidence for pwa-toolkit's
Presets comes from. The home page explains what a PWA is; every other page
is one capability's playground. The words used here (App Shell, Precache,
Runtime Cache, Build ID, Kill Switch, Gesture Zone, Swipe, ...) are defined in
[`toolkits/pwa-toolkit/CONTEXT.md`](../../toolkits/pwa-toolkit/CONTEXT.md) and
[`packages/use-gesture/CONTEXT.md`](../../packages/use-gesture/CONTEXT.md);
the app's own (Page Turn, Turn Surface, ...) in [`CONTEXT.md`](CONTEXT.md).

Pages are grouped into chapters by what a PWA promises. `src/lib/chapters.ts`
is the only list: the nav, the home page and prev/next links read it, and
each page declares its neighbours in it for Page Turns.

| Chapter    | Routes                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Install    | `/install`                                                                                                                 |
| Offline    | `/runtime-cache`, `/data`, `/offline`, `/auth-sim`                                                                         |
| Updates    | `/update`                                                                                                                  |
| The worker | `/status` (Inspector), `/rpc`                                                                                              |
| Gestures   | `/gestures`, `/gestures/sidebar`, `/gestures/pull-to-refresh`, `/gestures/swipe`, `/gestures/page-turn`, `/gestures/zones` |
| Deep dives | `/gestures/lab`, `/gestures/swipe-lab`, `/motion`: dense benches, out of the swipe order                                   |

Every playground has the same shape, from `src/components`: a `Page` (chapter,
title, lede), a `Playground` with a `Stage`, a few `Controls` and live
`Values`, a `Code` block generated from the current controls, a three-point
`Notice`, and a folded `Checklist` with the full test script. Stable
`data-testid`s stay on every readout and button for browser automation.

The app itself is the first gesture demo. `src/shell` wraps every page in one
`GestureProvider` and one zone: on a touch screen a Swipe in from the left edge
opens the menu (`useSidebar` with `edge: 24`), a Swipe sideways turns the page,
and a pull at the top reloads the route's loaders plus anything a page
registers with `usePageRefresh`. Page Turns live in `src/page-turn`, to move
into pwa-toolkit once settled: each page declares its neighbours with
`usePageTurn`, and a Swipe, ← and → or a click on a link to either turns to it,
with a Placeholder Page standing in until it loads. `/gestures/page-turn` slows
every load down to test that. Gesture playgrounds pass `gestures` to `Playground`, which makes it a
trapped zone, so a demo's touches never reach the app's own swipes.

The worker is `src/sw.ts`: `runServiceWorker()` plus a Worker Server for the
group in `src/rpc`. The Strategy rules live in `src/lib/strategies.ts`. UI is
`@kstackz/ui-toolkit` with Tailwind v4, and infrastructure is Alchemy
(`alchemy.run.ts`, `src/infra`), like `apps/docs`.

`/rpc?fakeBuildId=<id>` simulates Version Skew without touching the library:
the page swaps the Build ID meta tag while its Worker Client connects, so only
that client claims another build.

## Usage

### Add a playground

Add the route to a chapter in `src/lib/chapters.ts`, then build the page from
the kit. A gesture demo lives in `src/routes/-demos`, renders its own `Stage`,
`Controls` and `Values` (its hooks must sit inside the trapped zone), and
exports a function that turns its options into the snippet `Code` shows.

```tsx
<Page path="/gestures/swipe" lede={<p>One sentence on what it shows.</p>}>
  <Playground gestures>
    <SwipeDemo options={options} onOptions={setOptions} />
  </Playground>
  <Code title="Swipe" code={swipeCode(options)} />
  <Notice items={['Three things to look for.', '…', '…']} />
  <Checklist steps={['The full test script, one step per line.']} />
</Page>
```

### Run locally

`pnpm dev` starts Alchemy dev through Portless at
`https://pwa.kishore.computer` (with the worktree prefix in a Git worktree;
use the URL printed at startup). The worker is off in dev; `PWA_DEV=true pnpm
dev` turns it on with Build ID `dev` and an empty Precache.

To run the production worker locally, build and preview. The preview server
maps `/_shell` to `_shell.html` the way Cloudflare does, so the Precache
installs.

```bash
pnpm --filter @kstackz/pwa-toolkit build          # the app imports its dist
pnpm --filter pwa-playground build       # dist/client: sw.js, manifest, _headers, _shell.html, offline.html
pnpm --filter pwa-playground preview     # http://localhost:4173
pnpm --filter pwa-playground lint        # tsc --noEmit + laymos lint
pnpm --filter pwa-playground icons       # regenerate public/icons (node:zlib only)
```

To test offline in automation, emulate it on the service worker target as
well as the page (CDP `Network.emulateNetworkConditions` per target).
`agent-browser set offline on` covers only the page, so the worker still
reaches the network. Stopping the server is not a substitute: the automation
Chrome waits on refused localhost connections instead of failing them.

### Build switches

`vite.config.ts` reads four environment variables:

| Variable          | Default  | Effect                                                                         |
| ----------------- | -------- | ------------------------------------------------------------------------------ |
| `BUILD_LABEL`     | `local`  | Shown in the header and inlined into the client bundle                         |
| `PWA_ENABLED`     | `true`   | `false` builds the Kill Switch worker                                          |
| `PWA_PRESET`      | `app`    | `content` switches to the content Preset                                       |
| `PWA_UPDATE_MODE` | `prompt` | `auto-on-navigation`: the root applies a ready update on the next route change |

A new `BUILD_LABEL` changes the client bundle, so the Build ID, so open tabs
get the Update Prompt.

### Deploy

`.github/workflows/deploy-pwa-playground.yml` deploys `prod` at
`pwa.kishore.app` on pushes to `main`, and `pr<N>` previews at
`pr<N>-pwa.kishore.app` for pull requests that touch the app or any workspace
package it depends on (such as `@kstackz/pwa-toolkit`).
`cleanup-pwa-playground.yml` destroys a preview when its PR closes. CI sets
`BUILD_LABEL` to the run id and attempt. A manual dispatch takes `stage`,
`pwa_enabled` (a Kill Switch deploy), `pwa_preset` and `pwa_update_mode`.

Alchemy rebuilds only when hashed files change, so CI writes the switches to
`build-env.txt` before deploying. Deployed stages refuse to reconcile without
`ALLOW_DEPLOY=true`. For a one-off prod deploy from your machine:

```bash
pnpm --filter pwa-playground deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```
