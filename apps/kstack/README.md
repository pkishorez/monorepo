# kstack

Examples of the app layouts and behaviours kstack supports, each a complete app, published at kstack.kishore.app.

## Big picture

Each Example is one way an app can be laid out or behave, built as a real,
complete app you can open on a phone or a wide screen and copy from. The home
page lists them as cards; opening one grows its card into the whole screen.
The words are defined in [`CONTEXT.md`](CONTEXT.md).

An Example lives entirely in its own route folder, `src/routes/<example>`:
its use of ui-toolkit's `AppShell`, its account menu, pages and data, with its
components in `components/` and its helpers in `lib/`. TanStack Start is told
to skip folders named `components`, `hooks` and `lib`, so they never become
routes. Every Example has the same small base, from `src/common`: the theme the
document boots with (`theme.ts`), and Tweaks (`tweaks.tsx`), the settings you
change while using an Example to see its variations. An Example lists its
Tweaks in `lib/tweaks.ts`, each made with `tweak.choice`, `tweak.boolean` or
`tweak.text` (a label, a default, and a schema its saved value must pass), and
calls `useTweaks(name, tweaks)` wherever it needs them: it returns the values
and the button for the header's right edge. The button opens a panel pinned
over the top of the screen that stays open while you use the Example, so each
change shows live. Every call with the same name
shares one store, saved in the browser as `tweak:<name>`; a saved value that
fails its schema falls back to its default. Everything else lives
in the Example's folder, so reading one folder tells you everything about one
kind of app.

| Example     | Route        | What it shows                                                                                                                                                                                                                                                         |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `App Shell` | `/app-shell` | A sidebar, header and page. On a phone the sidebar pushes the page aside under a finger; on a wide screen it sits beside the page. Tweaks turn the sidebar, header, app link, group labels, account menu and resizing on or off, and set where a swipe opens it from. |

UI is `@kstackz/ui-toolkit` (shadcn on Base UI) with Tailwind v4, touch is
`@kstackz/use-gesture`, and infrastructure is Alchemy (`alchemy.run.ts`,
`src/infra`), like `apps/docs`.

kstack installs as a PWA through `@kstackz/pwa-toolkit` (`app` preset): the
`pwa()` plugin in `vite.config.ts` writes the manifest and service worker, and
the root shows an Update Prompt when a new deploy is ready. The home page's
**Check for updates** button asks for one on demand. `/offline` is the Offline
Fallback the worker needs; the worker is off in `pnpm dev`.

## Usage

### Add an Example

Make `src/routes/<example>/route.tsx` its layout, with its pages beside it and
everything else in its own `components/` and `lib/`, including its Tweaks. Then add a card to
`EXAMPLES` in `src/routes/index.tsx`, and give the Example's outermost element
`viewTransitionName: 'example'` so the card grows into it.

```tsx
// src/routes/app-shell/route.tsx
export const Route = createFileRoute('/app-shell')({
  component: () => (
    <Example>
      <Outlet />
    </Example>
  ),
});
```

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
