# Ledger on Expo: build notes

Running log of the Ledger on Expo build (brief: the untracked `plan.md`;
spec: `.claude/specs/ledger-on-expo.md`). Each phase adds a section:
challenges, hacks, drawbacks, open questions, cleanup still owed, and
improvements.

## Sign-in: OAuth + PKCE

Native Ledger signs in as a public OAuth client with PKCE (Ledger ADR 0009).
The Device Login plan from an earlier session (auth-toolkit ADR 0017, its
glossary edits and the old spec) was dropped; the spec now follows `plan.md`.
The app-level ADR on the split was renumbered to 0010 so it no longer
collides with ADR 0009.

## Phase 0: workspace

`ledger/*` is a workspace glob, and the default catalog holds the Expo SDK 57
set: expo 57.0.26, react-native 0.86.3, React and react-dom 19.2.3 (down from
19.2.8). The lockfile has one `react` and one `react-dom`. Syncpack lint,
kstack test and lint, and every toolkit test pass, the same as before the
change.

**Challenges**

- Expo published 57.0.27 on 2026-10-06, and the `sdk-57` branch's
  `bundledNativeModules.json` already names that release's modules. Four of
  them (expo-router 57.0.25, expo-sqlite 57.0.4, expo-constants 57.0.21,
  expo-linking 57.0.12) were under the 24-hour `minimumReleaseAge` hold. So
  the catalog follows expo@57.0.26's own `bundledNativeModules.json` instead,
  where every entry is past the hold. No exclusion was added.
- `pnpm install` only installs what a package uses, and nothing uses the
  Expo entries yet. So `pnpm why react-native` shows nothing yet, and no new
  install scripts showed up to decide in `allowBuilds`. None of the main new
  packages (expo, react-native, reanimated, worklets, audio-api, uniwind,
  Panel UI, expo-sqlite, gesture-handler, screens, svg) has an
  install, preinstall or postinstall script on npm.

**Hacks**

- None.

**Drawbacks**

- Web loses the React fixes in 19.2.4–19.2.8. From now on the Expo SDK
  decides when web gets React upgrades (requirement 19).
- The published packages' exact `react` and `react-dom` peers moved from
  19.2.8 to 19.2.3 (changeset `react-follows-expo`). Apps using these packages
  on a newer React now get a peer warning.

**Open questions**

- react-native-audio-api 0.13.6 says nothing about RN 0.86. It needs a
  dev-build check before Ledger relies on it (requirement 14).
- panelui-native 0.105.1 and panelui-cli 0.6.2 are in the catalog only as a
  reference. Panel UI's source also needs `tailwind-variants`, `clsx`,
  `tailwind-merge` and `@hugeicons/*`, plus the uniwind peers (`metro`,
  `metro-cache`, `metro-transform-worker`, `@expo/metro-config`). Add those
  to the catalog in the step that copies the components.
- SDK 57 bundles both `expo-network` and `@react-native-community/netinfo`.
  Only `expo-network` is in the catalog.

**Cleanup owed**

- After 2026-10-07 12:12 UTC, move the whole set to expo 57.0.27 and its
  `bundledNativeModules.json` (one patch each for expo-router, expo-sqlite,
  expo-constants and expo-linking), and check `babel-preset-expo` 57.0.14.
- Once `@ledger/expo` installs the set, review `allowBuilds` for any build
  scripts deeper in the tree and confirm `pnpm why react-native` shows one
  version.

## Phase 1: restructure

`apps/kstack` is now `ledger/core` (`@ledger/core`) and `ledger/web`
(`@ledger/web`), moved with `git mv`. The app's glossary and ADRs moved up to
`ledger/CONTEXT.md` and `ledger/docs/adr/`; its old `NOTES.md` (what Ledger
had to invent) is `ledger/web/NOTES.md`. Lint, tests and build pass, and a
browser smoke test behaved as before.

**The platform seam** (what the next phases build on)

- One Effect service, `LedgerPlatform`, in
  `ledger/core/src/client/platform/platform.ts` (`@ledger/core/client/platform`).
  Its shape:
  - `storage.table(table, 'device' | 'local-backend')`: a
    `Layer<StdTableService<Name>>` for a table in one of the device's
    databases. `device` holds Settings and Local Accounts; `local-backend`
    holds the Local Backend's `ledger` table.
  - `storage.copies`: the `StdSyncPlatform` a Remote Session keeps its copy
    in; `storage.listCopies()` and `storage.deleteCopy(name)`.
  - `lastUser.get` / `lastUser.set`: the User last opened on the Remote
    Backend.
  - `remote.auth`: a `Layer<Auth>` (web: `authLive`); `remote.ledgerUrl`: the
    origin whose `/rpc` is the Remote Backend.
  - `lifecycle.online()`, `onOnlineChange`, `onForeground`, and
    `launchBackend()` (web: `?backend=` in the address; Expo can return null
    or read a deep link).
- An app makes its client once: `createLedger(platformLayer)` from
  `@ledger/core/client/gate`. It returns `useApp`, `useBackend`, `setBackend`,
  `switchUser`, `checkAgain`, `addUser`, `takeLoginError`, `signOut`,
  `signOutEveryone`, `useLocalSignIn`, `useSettings`, `useChangeSettings` and
  `useOnline`. Web does it in `ledger/web/src/client/app/app.ts` with
  `webPlatform` from `ledger/web/src/client/platform/platform.ts`, the
  reference implementation for Expo's.
- The platform Layer is built once, on first use, and handed to each
  Backend's Layer with `Layer.succeed`, so nothing touches the platform while
  a module loads (the web build still prerenders the shell on the server).
- Command sounds are injected too: `setCommandSounds(play | null)` takes the
  platform's player for the `CommandSound` names, so `client/commands` has no
  Web Audio. Sounds are not part of `LedgerPlatform`: they belong to the UI
  kit (web's `kit/sound`, later the Expo Toolkit's `feedback`).

**How "platform-free" is enforced**

- `ledger/core/tsconfig.json` has `lib: ["ESNext"]` and `types: []`: no DOM,
  no Node. The only globals core sees are in `ledger/core/globals.d.ts`
  (`performance.now`, `crypto.randomUUID`).
- `ledger/core/tests/platform-free.test.ts` fails on any import of
  `react-dom`, `react-native`, `expo*`, std-toolkit's `db/idb` or
  `sync/platform/browser`, on any use of `window`, `document`, `indexedDB`,
  `localStorage`, `sessionStorage`, `navigator`, `location` or `history`, and
  on such a package in core's dependencies. Checked by planting a probe file:
  it fails as it should.
- Laymos has no rule for external imports, so the test is the guard; Laymos
  guards the layers inside each package.

**Checks**

- `pnpm install`, `pnpm lint` (vp check, syncpack, every package's lint
  including both laymos configs), `pnpm test` and `pnpm build`: pass. The
  one exception: `vp check` reports formatting in the untracked `plan.md`,
  which was left as it is on purpose.
- `pnpm build` in this worktree passed on the first run; the
  `apps/alchemy-console` "Could not resolve './declaration.js'" failure did
  not show (dist folders may have existed already).
- Smoke test with agent-browser, iPhone 14 emulation, on
  `https://ledger-on-expo.kstack.kishore.computer`:
  - Local Backend (`?backend=local`, and the address was cleaned): signed in
    as Ada, sample money loaded; Thumb Lock Step down went to Entries, Step
    up came back Home, the thumb lifting first called it off, Settings opened
    its Sections (General, Keys, Gestures) to the right and lifting Went to
    `/settings`; Add User signed Grace in and stayed on the same Place; Switch
    User went back to Ada with her balances; changing Backend to Remote and
    back kept Ada signed in on the Local Backend.
  - Remote Backend: Settings changed Backend at once, without a reload; the
    signed-out card offered Google; "Sign in with Google" went through the
    local sign-in service to Google's account page. `/rpc` answers
    `Unauthenticated` without a token. Signing in to Google itself could not
    be done: the agent has no Google account to use, so Remote Add User and
    Switch User were not driven past Google.
  - The Wrong Way shake was not checked by eye.

**Challenges**

- agent-browser has no multi-touch command, and CDP's
  `Input.dispatchTouchEvent` cannot lift one finger while another stays down
  (a `touchEnd` lifts all). The Thumb Lock was driven by dispatching
  synthetic `PointerEvent`s in the page instead (two pointer ids, the thumb
  held at the left). Good enough for a smoke test; a real touch would be
  better.
- The worktree guard refuses heredocs and some compound shell commands, so
  edits went through small scripts in `/tmp/ledger-p1`.

**Hacks**

- `globals.d.ts` declares `crypto.randomUUID` for core. Hermes has no
  `crypto.randomUUID`; the Expo app must polyfill it (expo-crypto) before
  core loads.
- Web's `storage.table` caches each table by database and name in a module
  `Map`, so a table opens once per tab, as before.

**Drawbacks**

- Screens now import from three places: `@ledger/core/client/*` for
  vocabulary and Session hooks, `client/app` for the client instance and
  theme, and `client/platform` for `AUTH_URL` (Settings' Manage Google
  Accounts link).
- `@kstackz/auth-toolkit/clients/auth` is one entry point holding both
  `authLive` (better-auth's browser client) and the platform-free `Auth`,
  `authLocal` and `localChooser`. Core imports only the latter, but on
  native the bundler must tree-shake `authLive` away; phase 4's expo target
  may want its own entry point.
- `@kstackz/use-keys` (`createKeys`, used by core's `keys`) is imported by
  core. Its provider listens to `window`, but only once mounted; the Expo app
  must not mount `keys.Provider`'s DOM listener, or use-keys needs the same
  core/`./web` split as use-gesture.
- The Remote URL is joined as a string (`${ledgerUrl}/rpc`), since React
  Native's `URL` is incomplete.

**Open questions**

- `Backend` changes made in another tab are still picked up on
  `onForeground`; on a phone there is one app, so Expo's `onForeground`
  just re-checks who is signed in.
- Should `AUTH_URL` (the Manage Google Accounts link) be part of
  `LedgerPlatform.remote`, so screens on both platforms get it the same way?
  Left in web for now.

**Cleanup owed**

- ADRs 0001–0008 name paths such as `src/server/domain` that are now in
  `ledger/core/src/`; they read as history and were left alone.
- `.github/workflows/*-kstack.yml` keep their names and the `Kstack` Alchemy
  stack name; only the paths moved to `ledger/web`. Renaming the stack would
  orphan deployed stages.
- I stopped the user's local sign-in service (`alchemy dev --stage local` in
  `~/CAREER/MINE/mine/packages/auth`) by mistake with a broad `pkill` while
  stopping Ledger's dev server, and restarted it with `pnpm dev` there; it
  answers at `https://auth.kishore.computer` again. Nothing in that repo was
  edited. If it misbehaves, restart it by hand.

**Improvements**

- `ledger/web/laymos.config.json` now declares the screens as a module graph
  (shell, the Places, the sheets, the parts) with each edge stated, instead
  of shared modules.

## Phase 2b: std-toolkit on Expo

`@kstackz/std-toolkit` gained two entry points, tested against an in-memory
`node:sqlite` database dressed in expo-sqlite's async API.

- `@kstackz/std-toolkit/db/sqlite/expo`: `makeExpoSQLite({ database })`, a
  `SQLiteDriver` over a database from `openDatabaseAsync`/`openDatabaseSync`.
  It uses `runAsync`, `getAllAsync` and `withExclusiveTransactionAsync`
  (guarded writes throw `SQLiteChangesMismatch` inside it, and expo-sqlite
  rolls back). It runs the shared StdTable conformance suite, like the Node,
  better-sqlite3 and D1 drivers.
- `@kstackz/std-toolkit/sync/platform/expo`: `expo({ database, tableName? })`
  is a `StdSyncPlatform` with a table `std-sync:<name>` per Std Sync in that
  one database (set up when the store opens), `noLeadership`, `noDoorbell`.
  `listStdSyncs(database)` returns `{ name, tableName }[]`;
  `deleteStdSync(database, name)` drops the table and its indexes.

What the Expo app's platform Layer should do (Phase 3a/4b):

```ts
const database = await openDatabaseAsync('ledger.db');
const driver = makeExpoSQLite({ database });
// storage.table(table, kind): SQLite.setup + SQLite.make(table, { database: driver, tableName })
// storage.copies: expo({ database })
// storage.listCopies: () => listStdSyncs(database)
// storage.deleteCopy: (name) => deleteStdSync(database, name)
```

**Challenges**

- Declaring `expo-sqlite` as an optional peer of std-toolkit made pnpm 11
  auto-install it as std-toolkit's own dependency, resolving `expo@58` and
  `react-native@0.87` and rewriting ~4,000 lockfile lines (drizzle's
  optional `expo-sqlite` peer then resolved too). That was reverted.

**Hacks and drawbacks**

- So expo-sqlite is **not** a dependency at all: the driver describes the
  three methods it calls as a structural `ExpoSQLiteDatabase` type, as the D1
  driver does for its binding. Neither entry point imports expo-sqlite, at
  runtime or for types. I checked once, outside the repo, that expo-sqlite
  57.0.3's real `SQLiteDatabase` assigns to it; nothing in CI re-checks that.
  If expo-sqlite changes those signatures, the app's typecheck catches it,
  not std-toolkit's.
- The driver never opens or closes a database; the app owns it (no `close`).
- The test fake runs the "exclusive" transaction on the same connection;
  expo-sqlite opens a second one. Concurrency between that connection and
  the main one is not covered by tests.
- No Doorbell means `deleteStdSync` does not stop a live Std Sync, unlike
  the browser preset. Dispose it first; a live one would then fail on the
  missing table.

**Open questions**

- `withExclusiveTransactionAsync` runs on its own connection. Do queries on
  the main connection meet `SQLITE_BUSY` while it holds the write lock, or
  does expo-sqlite wait? Check on the Simulator under sync load; WAL mode
  (`PRAGMA journal_mode = WAL`, set by the app) should help.
- Should all of Ledger's tables (device, local-backend, copies) share one
  database file, or one file each as on web? One file keeps listing simple;
  the presets above work either way.

**Improvements**

- If live deletion matters on native, an in-process Doorbell (a PubSub per
  database) would let `deleteStdSync` ring `closedTopic` as the browser does.

**Cleanup owed**

- Run the Expo conformance against the real expo-sqlite on a device once
  `ledger/expo` exists (Phase 3a), e.g. a dev-only screen or Maestro test.
  ||||||| be46cd20

## Phase 2a: use-gesture split

`@kstackz/use-gesture` is now a platform-free core at the package root and
the browser's bindings at `./web` (use-gesture ADR 0016). Ledger web and
ui-toolkit's app shell import from `@kstackz/use-gesture/web`; the Thumb
Picker's walk moved into the core as `TreeWalk`. Lint, tests and build pass;
a browser smoke test of the Thumb Lock behaved as before.

**What expo-toolkit builds on** (`packages/use-gesture/src/index.ts`)

- `createGestureProvider(zones: ZoneTree<Zone, Target>)` returns
  `{ sink, addZone, addGesture }`. `ZoneTree` is
  `{ zoneOf(target), parentOf(zone), trapped(zone) }`: how the platform's
  zones nest. Zone and Target are whatever the platform has (a view, a
  ref, an id).
- The touch source feeds `sink`: `down`, `move` and `up` with a
  `PointerSample` `{ id, x, y, t, target, undecided? }` (t in ms on the
  source's clock), and `cancelAll(t)` when the platform takes the touch or
  the app goes to the background. With no `undecided` moves the provider
  reads the Direction itself once a finger has gone `SLOP` (10) px. `pick`,
  `settle`, `claimsEdge` and `direction` are there for a source that decides
  ownership itself, as the browser does.
- Listeners (`addGesture(zone, listener)`) get `start`, `pointer` (land or
  lift), `move`, `direction` and `end`, with immutable `Pointer`s
  `{ id, target, start, x, y, dx, dy, end? }`; options `enabled`,
  `directions`, `captures`, `guardsEdge`, `acts`.
- `Swipe.*` (`along`, `movement`, `fingersMatch`, `startsFrom`, `commits`,
  `release`, `createVelocity`, `DEFAULT_COMMIT`) are the Swipe Recognizer's
  rules; `TreeWalk.*` (`begin`, `move`, `chosen`, `columns`, `opens`,
  `DISTANCES`) is the Place Picker's walk, generic over the choice type.
- On the web, `./web`'s `GestureProvider` is exactly this: the core over
  `DOM_ZONES` and the browser's touch input, with a per-provider mirror
  (`web/zones/zone/motion-pointers.ts`) that turns the core's Pointers into
  Motion values. A native one mirrors them into Reanimated shared values the
  same way.

**How "platform-free" is enforced**

- Laymos: layers `core` → `entry` (the root door) → `web-zones` →
  `web-recognizers` → `web-patterns` → `web-entry`. Nothing below `./web`
  may import it, and the web reaches the core only through the root door.
- `tsconfig.core.json` compiles `src/index.ts` and `src/core` with
  `lib: ["ESNext"]`, `types: []`; part of the package's `lint`.
- `src/core/tests/platform-free.test.ts` fails on any package import (the
  core has none: no react, react-dom, motion), any import of `web/`, and any
  browser-only global (`window`, `document`, `matchMedia`, `innerWidth`,
  `performance`, `Element`, `PointerEvent` …). Checked with a planted probe:
  both guards fail as they should.

**Checks**

- `pnpm lint` and `pnpm test` pass for the whole repo. `pnpm build` passed on
  the second run; the first failed in `apps/docs` with `fetch failed`
  (ETIMEDOUT to a localhost port while prerendering), unrelated to this
  change. The alchemy-console `declaration.js` failure did not show.
- Smoke test (agent-browser, iPhone 14 emulation, Local Backend, Ada with
  sample money), Thumb Lock driven by synthetic touch `PointerEvent`s as in
  Phase 1: Step down went to `/entries`; Step up came back to `/`; the thumb
  lifting first went nowhere; three Steps reached Accounts and right opened
  Cash, lifting went to that account's Entries; Settings → right → General
  went to `/settings`; a push left on Home shook the menu once (counted
  through `Element.animate`).

**Challenges**

- The worktree guard refused heredocs into files, `eval` in a command line,
  and some `git mv` chains with variables; the browser scripts live in
  `/tmp/2a-scripts`.

**Hacks**

- The web keeps the old Pointer shape (Motion values) by mirroring the core's
  snapshots per provider. The mirror updates a finger's Motion values only
  while some web listener of the Gesture is still taking it, since moves
  reach the web through listeners' `move`. Every web listener mirrors, so in
  practice nothing changed; a listener that keeps reading a Pointer after
  its Gesture dropped it no longer sees it move (none does today).

**Drawbacks**

- Breaking import change: `@kstackz/use-gesture` (root) no longer has
  `GestureProvider`/`GestureZone`/`useSidebar`/`usePullToRefresh`, and
  `./core` and `./recognizers` are gone; everything web is `./web`.
  Changeset `use-gesture-platform-free-core` (patch, as this branch releases
  everything) says so.
- The core makes a new map and Pointer on every move (a few fingers at
  most), where the old tracker mutated Motion values in place.
- `motion`, `react` and `react-dom` became optional peers; pnpm will not warn
  a web app that forgets them.

**Open questions**

- A Thumb Lock in a zone whose inner zone wants sideways swipes (Settings'
  Section swipe) gives the sideways push to the inner zone, so no Wrong Way
  shows there. Same logic as before the split; not checked against the base
  build.
- Should the Thumb Lock itself (a still thumb on the left half beside a
  moving finger, `ledger/web/src/client/kit/thumb-picker/lock.ts`) move into
  the core as a recognizer? 3c will need the same rule on a phone; today it
  reads `window.innerWidth` and Motion values.

**Improvements**

- The Place Picker's columns (`columnsOf`) moved from Ledger's
  `thumb-picker.tsx` into the core as `TreeWalk.columns`, with tests, so the
  native picker draws the same columns.
- New tests: the provider on a plain tree (moves, SLOP, undecided moves,
  cancel time), `DOM_ZONES`, the Motion mirror, and TreeWalk's columns.

**Cleanup owed**

- The later web-toolkit merge takes `./web` (with ui-toolkit, pwa-toolkit and
  use-keys); the core stays as `@kstackz/use-gesture` or becomes its own
  gestures package then.
- `use-keys` still needs the same core/`./web` split (Phase 1 drawback).
- ADRs 0002–0015 name the old `src/core`/`src/recognizers` paths; they read
  as history. ADR 0010 is marked partly superseded by 0016.
