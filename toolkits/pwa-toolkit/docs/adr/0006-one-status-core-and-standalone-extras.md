# One Status for the core, standalone Extras beside it

The Client side exposes one service, `Pwa`: a single Status (Unsupported, Installing, Ready, Update Ready, Updating) plus `checkForUpdate` and `applyUpdate`. The Status is read from the browser's own service worker events (`controllerchange`, `updatefound`, `statechange`, the registration's `installing` / `waiting` / `active`), so the Client never asks the worker how it is. The only message outside Worker RPC is the activate Command; the `GET_BUILD_ID` and `CLEAR_RUNTIME_CACHE` messages were never sent by any Client and are gone ([ADR 0002](0002-control-channel-separate-from-worker-rpc.md) still explains why that one message stays out of Worker RPC).

Everything the PWA does not need to work (the Install Prompt, online state, display mode, storage persistence) moved to `@kstackz/pwa-toolkit/extras`. Each Extra keeps its service, hook and UI in one folder, builds its own page-wide service on first use, and needs no provider; nothing in the core imports it.

## Considered Options

- **Keep one provider for everything** — early browser events such as `beforeinstallprompt` were caught for free, but every app paid for features it did not use, and the core surface mixed "is my app offline-ready" with "which display mode am I in".
- **Keep `update.mode: 'auto-on-navigation'`** — it needed a `router` prop on the provider for one line of app code (`router.subscribe('onResolved', applyUpdate)`); the app now writes that line itself.

## Consequences

The browser offers install once, early, so an app that shows the Install Prompt calls `useInstall()` (or renders `InstallPrompt`) in its root; the shared service then remembers the offer for any later page. Before `PwaProvider` starts, and during SSR, the Status is `Unsupported`.
