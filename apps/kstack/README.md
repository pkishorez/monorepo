# kstack

Showcases of the app layouts and behaviours kstack supports, each a complete app, published at kstack.kishore.app.

## Big picture

Each Showcase is one way an app can be laid out or behave, built as a real,
complete app you can open on a phone or a wide screen and copy from. The home
page lists them as cards; opening one grows its card into the whole screen.
The words are defined in [`CONTEXT.md`](CONTEXT.md).

A Showcase lives in `src/showcases/<showcase>`, a deep module whose
`index.ts` is all its routes in `src/routes/<showcase>` use. Showcases share
only `src/common`: the theme (`theme.ts`), Tweaks (`tweaks.tsx`, settings
saved in the browser as `tweak:<name>` and changed live from a panel), and
the Code dialog (`code.tsx`), which shows a file exactly as it is, imported
with `?raw`, so the code shown never drifts from what runs.

| Showcase    | Route        | What it shows                                                                                                                                      |
| ----------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App Shell` | `/app-shell` | A sidebar, header and page; Tweaks turn each part on or off and set where a swipe opens the sidebar.                                               |
| `Gestures`  | `/gestures`  | What `@kstackz/use-gesture` can do, one Topic per page, each Scenario a sentence, a live demo and its code. Topics live in `topics/<topic>`.       |
| `Features`  | `/features`  | End-to-end apps where gestures meet, such as Mail, Photos and Chat, each full screen with what to try and its code. Each lives in `<feature>/`.    |
| `Keyboard`  | `/keyboard`  | A notes app run from the keyboard with `@kstackz/use-keys`: Surfaces, a palette, every key and where it stands, and settings that record new keys. |

UI is `@kstackz/ui-toolkit` (shadcn on Base UI) with Tailwind v4, touch is
`@kstackz/use-gesture`, keys are `@kstackz/use-keys`, and infrastructure is Alchemy (`alchemy.run.ts`,
`src/infra`), like `apps/docs`.

kstack installs as a PWA through `@kstackz/pwa-toolkit` (`app` preset): the
`pwa()` plugin in `vite.config.ts` writes the manifest and service worker, and
the root shows an Update Prompt when a new deploy is ready. The home page's
**Check for updates** button asks for one on demand. `/offline` is the Offline
Fallback the worker needs; the worker is off in `pnpm dev`.

## Usage

### Add a Gestures Topic

Make `src/showcases/gestures/topics/<topic>/`: one file per Scenario, and
`<topic>.ts` listing them, each imported twice, to run and as its code. Then
add it to a group in `topics.ts`.

```ts
// src/showcases/gestures/topics/sidebar-scroll/sidebar-scroll.ts
export const sidebarScroll: Topic = {
  slug: 'sidebar-scroll',
  title: 'Sidebar + scrolling page',
  icon: PanelLeftIcon,
  scenarios: [
    {
      slug: 'anywhere',
      sentence:
        'A long page, and a sidebar that opens from anywhere. Drag up or down, then sideways, then diagonally.',
      Demo: Anywhere,
      source: anywhere, // import anywhere from './anywhere.tsx?raw'
      file: 'anywhere.tsx',
    },
  ],
};
```

- The demo fills a card that is already a trapped Gesture Zone, so the
  Showcase's sidebar, which opens only from the screen's edge, never hears it.
- `fullScreen: true` opens it alone at `/gestures/<topic>/<scenario>`, for
  Scenarios that need the screen's edges.
- `useStageStatus(text)` writes the line under the demo.

### Run locally

`pnpm dev` starts Alchemy dev through Portless at
`https://kstack.kishore.computer` (with the worktree prefix in a Git worktree;
use the URL printed at startup).

```bash
pnpm --filter kstack build   # dist/client and dist/server
pnpm --filter kstack lint    # tsc --noEmit + laymos lint
pnpm --filter kstack icons   # regenerate public/icons (node:zlib only)
```

### Deploy

`.github/workflows/deploy-kstack.yml` deploys `prod` at `kstack.kishore.app`
on pushes to `main`, and `pr<N>` previews at `pr<N>-kstack.kishore.app` for
pull requests that touch the app or any workspace package it depends on.
`cleanup-kstack.yml` destroys a preview when its PR closes. Deployed stages
refuse to reconcile without `ALLOW_DEPLOY=true`. For a one-off prod deploy
from your machine:

```bash
pnpm --filter kstack deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```
