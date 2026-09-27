# pwa-playground

Test bed that dogfoods pwa-toolkit: one TanStack Start page per PWA scenario, published at pwa.kishore.app.

## Big picture

`pwa-toolkit` turns a TanStack Start app into a PWA. This app is where every
part of it gets exercised in a real browser, and where the evidence for its
Presets comes from. Each route is one scenario: a short explanation, live
readouts, and buttons, all with stable `data-testid`s for browser automation.
The words used here (App Shell, Precache, Runtime Cache, Build ID, Kill
Switch, ...) are defined in
[`toolkits/pwa-toolkit/CONTEXT.md`](../../toolkits/pwa-toolkit/CONTEXT.md).

| Route            | Scenario                                                                  |
| ---------------- | ------------------------------------------------------------------------- |
| `/status`        | Build ID, controller and registration, update state, storage, caches      |
| `/install`       | Install Prompt and its state                                              |
| `/update`        | Update Prompt, check now, Coordinated Reload                              |
| `/runtime-cache` | One `/api/time/<strategy>` endpoint per Runtime Cache strategy            |
| `/data`          | A loader whose `/api/data` fetch is cached network-first                  |
| `/rpc`           | Worker RPC: `Echo`, `Ticks` (stream), `WorkerInfo`, and Version Skew      |
| `/auth-sim`      | `/api/auth/session` is never cached; sign-out calls `clearRuntimeCache()` |
| `/offline`       | The Offline Fallback, prerendered and precached                           |

The worker is `src/sw.ts`: `runServiceWorker()` plus a Worker Server for the
group in `src/rpc`. The Strategy rules live in
`src/lib/strategies.ts`. UI is `kui-toolkit` with Tailwind v4, and
infrastructure is Alchemy (`alchemy.run.ts`, `src/infra`), like `apps/docs`.

`/rpc?fakeBuildId=<id>` simulates Version Skew without touching the library:
the page swaps the Build ID meta tag while its Worker Client connects, so only
that client claims another build.

## Usage

### Run locally

`pnpm dev` starts Alchemy dev through Portless at
`https://pwa.kishore.computer` (with the worktree prefix in a Git worktree;
use the URL printed at startup). The worker is off in dev; `PWA_DEV=true pnpm
dev` turns it on with Build ID `dev` and an empty Precache.

To run the production worker locally, build and preview. The preview server
maps `/_shell` to `_shell.html` the way Cloudflare does, so the Precache
installs.

```bash
pnpm --filter pwa-toolkit build          # the app imports its dist
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
package it depends on (such as `pwa-toolkit`).
`cleanup-pwa-playground.yml` destroys a preview when its PR closes. CI sets
`BUILD_LABEL` to the run id and attempt. A manual dispatch takes `stage`,
`pwa_enabled` (a Kill Switch deploy), `pwa_preset` and `pwa_update_mode`.

Alchemy rebuilds only when hashed files change, so CI writes the switches to
`build-env.txt` before deploying. Deployed stages refuse to reconcile without
`ALLOW_DEPLOY=true`. For a one-off prod deploy from your machine:

```bash
pnpm --filter pwa-playground deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```
