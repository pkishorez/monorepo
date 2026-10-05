# kstack

Ledger: a money tracker that is the blueprint for every kstack app, run by keys where there is a keyboard and by gestures where there is a touch screen, published at kstack.kishore.app.

## Big picture

kstack is one complete app built only from the kstack packages, so a new app
can start from it. Ledger writes down the money you spend and earn and shows
where it goes: Home for this month, Entries, one Entry, Months, and Settings,
with Add as a sheet over them. The words are defined in
[`CONTEXT.md`](CONTEXT.md); the tokens, focus ring, container queries and
keyboard-or-touch rules every screen follows are in [`DESIGN.md`](DESIGN.md).
What the app had to invent that a package could one day own is listed in
[`NOTES.md`](NOTES.md).

Every Command lives once in `src/commands/keys.ts`, as a
`@kstackz/use-keys` Action with its keys and its Surface. Gestures from
`@kstackz/use-gesture` run the same Actions through `keys.useRun()`, so a
Command works in exactly the same Places from a key or a finger. Key hints
show only where there is a keyboard, gestures only where there is a touch
screen, and the user can switch either off in Settings. On a touch screen
the **Thumb Lock** is the modifier: the left thumb resting still while another
finger swipes runs Jump (down), Add (up), Next (left) or Previous (right),
shown live on the **Compass**. Plain swipes stay plain: one finger scrolls,
or opens the sidebar from anywhere. `Space e` gives the keys to the sidebar,
and Escape gives them back to whatever had them.

Money is a std-toolkit `StdTable` in D1, one partition per user
(`src/server`), served at `/rpc` as an Effect RPC API that auth-toolkit guards
with the session of `auth.kishore.app`. The browser keeps its own copy in
IndexedDB through Std Sync and TanStack DB (`src/client/data`), so the app
opens offline and every write shows at once. `src/kit` holds what the app
needed that no package has yet; each module there knows nothing of Ledger.
Layers and their rules are in `laymos.config.json`; why gestures run the
keys' Actions is in [docs/adr/](docs/adr/).

## Usage

### Run locally

`pnpm dev` starts Alchemy dev, with a local D1, through Portless at
`https://kstack.kishore.computer` (with the worktree prefix in a Git worktree;
use the URL printed at startup). Sign in with Google through the local Auth
Worker, or open `/?preview=on` for a preview: Ledger for a stand-in user, its
server the real handlers over a table in memory in the tab. The preview exists
only in development; `/?preview=off` ends it.

```bash
pnpm --filter kstack test    # domain, Thumb Lock, keys, and the Ledger API
pnpm --filter kstack build   # dist/client and dist/server
pnpm --filter kstack lint    # tsc --noEmit, laymos lint, and no invented colours
pnpm --filter kstack icons   # regenerate public/icons (node:zlib only)
```

### Add a Command

Give the Action its keys in `src/commands/keys.ts`, its gesture in
`src/commands/gestures.ts` if it has one, and its Handler in the Place that
answers it, with `useCommand`. The Handler runs from its keys, the palette,
and its gesture alike, and each time it sounds and shows in the Key Bar.

```ts
// src/commands/keys.ts, inside the entries Surface
remove: { keys: [sequence('d d')], description: 'Delete the entry' },

// src/app/entries/list.tsx
useCommand('entries.remove', () => removeEntry(marked), {
  enabled: active && marked !== undefined,
});
```

- An Action with no enabled Handler is dimmed on the Compass, and a swipe
  toward it is a Wrong Way.
- Global Actions such as `next` are answered by whichever Place is shown, so
  `j` and a Thumb Lock swipe left mean the next Entry on Entries and the next
  Month on a Month.

### Deploy

`.github/workflows/deploy-kstack.yml` deploys `prod` at `kstack.kishore.app`
on pushes to `main`, and `pr<N>` previews at `pr<N>-kstack.kishore.app` for
pull requests that touch the app or any workspace package it depends on.
`cleanup-kstack.yml` destroys a preview when its PR closes. Each stage has its
own D1 database, and its table refuses a deploy its stored rows could not be
read after. Deployed stages refuse to reconcile without `ALLOW_DEPLOY=true`.

```bash
pnpm --filter kstack deploy:prod   # ALLOW_DEPLOY=true alchemy deploy --stage prod
```
