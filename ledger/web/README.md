# @ledger/web

Ledger on the web, published at kstack.kishore.app: the TanStack Start pages, the Worker serving the cloud Backend's Ledger API, the infra and the PWA, deployed in one go.

## Big picture

Ledger is a money tracker that is the blueprint for every kstack app, run by
keys where there is a keyboard and by gestures where there is a touch screen,
built only from the kstack packages, so a new app can start from it. It writes
down the money you spend and earn and shows where it goes: Home for this
month, Entries, one Entry, Months, and Settings, with Add as a sheet over
them. This package is its web app; everything the web and the Expo app share
is in [`@ledger/core`](../core). The words are defined in
[`../CONTEXT.md`](../CONTEXT.md); the tokens, focus ring, container queries
and keyboard-or-touch rules every screen follows are in
[`DESIGN.md`](DESIGN.md). What the app had to invent that a package could one
day own is listed in [`NOTES.md`](NOTES.md).

Every Command lives once in core's `src/commands/keys.ts`, as a
`@kstackz/use-keys` Action with its keys and its Surface. Gestures from
`@kstackz/use-gesture` run the same Actions through `keys.useRun()`, so a
Command works in exactly the same Places from a key or a finger. Key hints
show only where there is a keyboard, gestures only where there is a touch
screen, and the user can switch either off in Settings. On a touch screen
the **Thumb Lock** is the modifier: the left thumb resting still while another
finger swipes brings up the **Place Picker** over a dimmed, blurred screen:
up and down Step through the Places, right opens a Place's Sections or the
Accounts, left goes back, and lifting Goes; a way that leads nowhere shakes
the picker. Plain swipes stay plain: one finger scrolls,
or opens the sidebar from anywhere. `Space e` gives the keys to the sidebar,
and Escape gives them back to whatever had them.

`src/` reads top-down: `routes/` (with `router.tsx`) starts the browser,
one thin route per Place, and `routes/__root.tsx` is
`createRootRoute(app.root({ stylesheet }))`; `screens/` holds the shell, each
Place, the sheets and the parts they share; `app.ts` makes Ledger once with
the Web Platform's `createApp`, from core's `apis`, `device`, `ledgerSession`
and `ledgerCache`; `mark.tsx` is `LedgerMark`, shown above the name before
sign-in; `worker.ts` is the Worker: the Web Platform's `createServer` as its
default export, and `LedgerObject`, each User's Durable Object, made with its
`liveObject`; and `infra/` deploys them, binding D1 as `DB` and the Durable
Object as `LedgerObject`. `stage.ts` says where this stage's sign-in service
is. The Shell is `SignedIn` around the keys and the Frame; until an Account
is open, the Web Platform shows its own screens before sign-in. Layers and
their rules are in `laymos.config.json`; the layout is the root
[ADR 0004](../../docs/adr/0004-an-app-is-api-backend-and-stores.md).

Ledger runs on one of two Backends, as Settings choose: the cloud Backend,
where Users sign in with Google at `auth.kishore.app`, or the device Backend,
where the same handlers answer in the page from IndexedDB and anyone signs in
by name. On the cloud Backend core's Sync Mode decides where money is kept. In
`realtime`, the default, each User's money is in their own Durable Object,
reached over a WebSocket at `/live` that pushes every change to each of their
devices. In `polling` it is a std-toolkit `StdTable` in the shared D1
database, served over HTTP at `/rpc` and asked for every few seconds. Only the
services differ: `worker.ts` gives core's Backend `tableDurableObject` or
`tableCloud` (with `authz.cloud` checking every call), and the app runs it in
the page on `tableDevice`, `broadcasterDevice` and `authz.device`. The
Platform Toolkit's Gate, under the Web
Platform's `createApp`, keeps the Backend and opens each User's Session as
they become active, without a reload when the Backend changes. What only a
browser has (IndexedDB, the sign-in service's cookies, window events,
`?backend=` in the address) is the Web Platform's Host, which Ledger never
meets. A Session holds the User's money through Std Sync and TanStack DB, so
every write shows at once, each call signed with that User's own token. On
the cloud Backend Std Sync keeps it in IndexedDB, so Ledger opens offline,
and the syncs of Users no longer signed in are deleted. The device's Settings,
its Cache, are a `StdTable` in IndexedDB alone, read the same way. The
decisions behind gestures, signing, the two Backends and the split into
core, web and Expo are in [`../docs/adr/`](../docs/adr/).

## Usage

### Run locally

`pnpm dev` starts Alchemy dev, with a local D1 and Durable Objects, through Portless at
`https://kstack.kishore.computer` (with the worktree prefix in a Git worktree;
use the URL printed at startup). Sign in with Google through the local Auth
Worker at `https://auth.kishore.computer`, which must be running too, or open
the app with `?backend=device` to use the device Backend, which needs neither:
that is how an agent or a browser test drives Ledger. The cloud Backend's
`/live` checks the token in the socket's address with that same Auth Worker
before opening, so without it every connect is refused (`503` when the
sign-in service can't be asked, `401` with no token).

```bash
pnpm --filter @ledger/web test    # the Worker's check of Access Tokens; core has its own
pnpm --filter @ledger/web build   # dist/client and dist/server
pnpm --filter @ledger/web lint    # tsc --noEmit, laymos lint, and no invented colours
pnpm --filter @ledger/web brand   # regenerate public/icons and splash (node:zlib only)
```

### Add a Command

Give the Action its keys in core's `src/commands/keys.ts`, its gesture
in core's `src/commands/gestures.ts` if it has one, and its Handler in the Place that
answers it, with `useCommand`. The Handler runs from its keys, the palette,
and its gesture alike, and each time it sounds and shows in the Key Bar.

```ts
// ledger/core/src/commands/keys.ts, inside the entries Surface
remove: { keys: [sequence('d d')], description: 'Delete the entry' },

// src/screens/places/entries/list.tsx
useCommand('entries.remove', () => removeEntry(marked), {
  enabled: active && marked !== undefined,
});
```

- A Thumb Lock swipe toward an Action with no enabled Handler is a Wrong
  Way: the picker shakes.
- Global Actions such as `next` are answered by whichever Place is shown, so
  `j` means the next Entry on Entries and the next Month on a Month.

### Deploy

`.github/workflows/deploy-kstack.yml` deploys `prod` at `kstack.kishore.app`
on pushes to `main`, and `pr<N>` previews at `pr<N>-kstack.kishore.app` for
pull requests that touch the app or any workspace package it depends on.
`cleanup-kstack.yml` destroys a preview when its PR closes. Each stage has its
own D1 database, and its table refuses a deploy its stored rows could not be
read after. Deployed stages refuse to reconcile without `ALLOW_DEPLOY=true`.

```bash
pnpm --filter @ledger/web deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```
