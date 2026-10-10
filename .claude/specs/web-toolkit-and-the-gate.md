# Spec: web-toolkit-and-the-gate

Source: `this conversation`

## Problem

Every kstack web app wires the same things by hand: the root document and head, the Theme, the Frame and Sidebar, sign-in, the local or remote Backend, the `/rpc` server, and, for Ledger, the PWA. The pieces sit in two Toolkits (ui-toolkit, pwa-toolkit) and in Ledger itself; about 1,500 lines of Ledger web are setup any web app needs, and three other apps repeat Ledger's root route. The Gate, which runs sign-in, the Backend and the Active Session, lives in `ledger/core` though nothing in it but the Session's contents is Ledger's, and it waits on the network before showing data the device already has.

kstack needs one opinionated Web Toolkit an app is built from, with a Gate both platforms share, so a new app writes only its API, its Session's contents and its screens.

## Outcome

- `@kstackz/web-toolkit` exists and `@kstackz/ui-toolkit` and `@kstackz/pwa-toolkit` are deleted. Every app in the repo (Ledger web, `apps/docs`, `apps/alchemy-console`, auth-toolkit's sign-in app, devtools) builds on it.
- An app that leaves the `pwa` layer out ships no service worker, manifest or Update Prompt.
- auth-toolkit exposes the Gate with no platform code; Ledger web and Ledger Expo both run on it, through web-toolkit and expo-toolkit.
- An Account Switch shows the new User's data on the next render; an Account Lost stops the app behind a dialog the User cannot dismiss until they sign in to that account again or switch to another.
- Signed-out pages, signed-in pages and signed-in parts of a page are composed declaratively.
- Ledger's client setup is about 20 lines and overrides nothing but what its Session Lifetime holds.
- expo-toolkit calls its top layer `recipes`.
- The devtools-only blocks live in a private `@devtools/ui`, bundled into `@kstackz/devtools`.

## Requirements

1. web-toolkit's layers, bottom to top: `theme`, `feedback`, `input`, `components`, `form`, `recipes`, `client`, `pwa`; `server` beside them. Each layer is one subpath, checked by Laymos.
2. `theme` depends on nothing; the Theme's TanStack Start server function belongs to `client`.
3. `feedback` is sound, mirroring expo-toolkit's haptics layer.
4. `input` holds touch-versus-keyboard detection with its pre-paint script and CSS variants (`touch:`, `keyboard:`), the web part of `@kstackz/use-gesture`, and `@kstackz/use-keys`.
5. `components` holds the owned shadcn copies (private `parts/`), icons, `cn`, and the general viewers (json, markdown, diff, source, file tree, git changes).
6. `form` sits on `components`. Its tie to `input` is deferred.
7. `recipes` hold whole interactions: Frame and Sidebar, Thumb Picker, Key Bar, Swipe Row, Sheet, Local Sign-In, Sign-In, User Switcher (Account Switcher), Update Prompt and Install Prompt, the Account Lost dialog, and the dialog showing a Gate Notice. Recipes adapt to touch or keyboard themselves (one Sheet is a dialog with a keyboard and a drawer on touch; the Sidebar pushes the page on touch and stays beside it with a keyboard). Recipes never import `client` and never require being inside `<SignedIn>`.
8. `client` is the opinionated way in, on TanStack Start: the root document and head (charset, viewport, title, favicon, `theme-color`, Theme script), the 404 page, the web platform pieces the Gate needs (IndexedDB, including the Gate's device table, `?backend=`, online and visibility events, the other tabs), and the React wiring of the Gate.
9. `client` exposes places for `pwa` to plug into (head tags, a root provider, routes) and never imports `pwa`.
10. `pwa` owns the Vite plugin, the service worker, the Client Status, Worker RPC, the Extras, the manifest, apple-touch-icon, iOS splash images and their device table (with a generator CLI), Build ID meta tags and the Offline Fallback page. Presets stay (`app`, `content`).
11. `server` is a plain fetch handler routing `/rpc` to the app's handlers and everything else to TanStack Start, plus an RPC-over-HTTP host, with Cloudflare and alchemy as the one fully set-up default.
12. web-toolkit ships built `dist/`.
13. web-toolkit depends on auth-, rpc- and std-toolkit and re-exports none of them.
14. The Gate lives in auth-toolkit with no platform code: Backends, Signed-in Accounts, the Active Account, the Backend Lifetime and the Session Lifetime, and the views `checking`, `signedOut`, `opening`, `open`, `signingOut`, `unopenable` and `accountLost`.
15. The app gives the Gate what lives in each lifetime: Backend Lifetime services (public calls, work that outlives an Account Switch) and Session Lifetime services built for one User, which may use the Backend Lifetime's. By default the RPC connection lives in the Session Lifetime, so an Account Switch ends it and every call in flight.
16. Only the Active Account's Session Lifetime is open.
17. The Backend gives the Gate a connection Layer, never a URL: remote over HTTP and local in-process now; the shape admits a WebSocket or Durable Object connection later.
18. Several Signed-in Accounts per device, and the Local Backend, are on by default. An app's handlers run unchanged on both Backends, with storage given from outside.
19. Each Session signs its own calls with its own token, never the cookie (Ledger ADR 0002 holds).
20. Open First: on an Account Switch, or at launch with an Active Account among the Remembered Accounts, the Session Lifetime opens at once from its Copy; its calls wait for the token the check brings, and the cookie switch and the check run behind. The User Switcher shows every Remembered Account before the Backend answers. `checking` shows only when the device knows nobody. `useSession()` never waits on the network; a collection with no copy yet waits by its own `ready`.
21. Account Lost: when a check finds the Active Account no longer signed in, and this device did not sign it out, the Gate ends its Session Lifetime, keeps its Copy, marks the account lost in its device table, and shows the `accountLost` view with the lost account and the other Signed-in Accounts. The view cannot be dismissed and returns after a reload, offline too. Signing in to the same account again clears the mark and reopens the Copy; opening any other account (switching, or signing in as someone else) deletes the lost account's Copy; with no other account, the User may Sign Out instead. Cleanup of Copies skips a lost account while it is marked. Writes that never reached the Backend are lost with the Copy.
22. Gate Notices are read once (`takeNotice()`); the Login Error is the one kind left. Account Lost is a view, not a Gate Notice.
23. An Account Switch while offline works from the Copy; its calls and the cookie switch wait for the network.
    23a. Remembered Accounts: the Gate keeps, per Backend, the Signed-in Accounts of its last check (users and which was active, never tokens) in one device-level Std table, which also holds the chosen Backend and the lost-account mark. Every answer from the Backend replaces them whole. A Remembered Account the Backend no longer names, other than the Active Account, is dropped silently and its Copy deleted. The Gate's `localStorage` memory goes away.
24. Sign Out needs the Backend: it is not offered while the Remote Backend cannot be reached. The Local Backend can always be signed out of.
25. An interruption caused by a lifetime ending is never an error and never shows a toast. Session-bound helpers (running a command in the Session Lifetime, reading its collections) handle a switch themselves.
26. Every Account Switch, Sign Out and Backend change is announced to the device's other tabs at once, and they follow silently; cookie switches are queued so the last one wins. A check (at launch, on coming back into view, or when the network returns) that finds another account active, switched by another app on the Shared Cookie Domain or the Auth Worker's pages, follows it silently too. Each Session Lifetime signing its own calls and cutting off its calls in flight is what keeps a silent switch from mixing two Users' data.
27. After the same account fails to open twice in a row, the Gate stops in an `unopenable` view offering Retry and Sign Out.
28. Without the PWA, the Local Backend's code may fail to load offline; that is accepted.
29. When a Std Sync is disposed, it first waits a bounded time for Mutation Callbacks in flight. There is no "changes not saved" prompt.
30. Composition: `<WebApp>` at the root gives the Gate without starting it; the Gate starts the first time anything asks. `<SignedIn fallback>` and `<SignedOut>` wrap any part: the whole app, one route, one control. `useSession()` throws outside `<SignedIn>`; `useAuth()` works anywhere and returns the view. Everything inside `<SignedIn>` remounts on an Account Switch, so it is placed as low as it can be.
31. The Frame knows nothing of sign-in; the app fills its slots (the User Switcher's place in the Sidebar) and wraps them in `<SignedIn>`.
32. The PublicApi (no Authz, over the Backend Lifetime's connection) and UserApi (Authz, over the Session Lifetime's) split is the documented convention; one group with Authz stays valid.
33. auth-toolkit's sign-in-service screens (consent, grants, scopes, session list, and the rest of `blocks/auth` except Local Sign-In and the Account Switcher) move into auth-toolkit, next to its sign-in app.
34. The devtools-only blocks (laymos, otel-trace-viewer with its trace model and presentation, monoverse, flow-swimlane, devtools-panel) move to a private `@devtools/ui` at `devtools/ui`, a devDependency of `@kstackz/devtools`, bundled at build time and built on web-toolkit.
35. expo-toolkit renames `patterns` to `recipes`; it gives the Gate its platform pieces and React wiring as web-toolkit does.
36. Ledger's reusable web code moves in the same change: device detection to `input`; thumb picker, key bar, swipe row, user switcher and Sidebar keys to `recipes`; sound to `feedback`; the `/rpc` handler and Worker entry to `server`; splash and head setup to `pwa`/`client`.
37. Every app switches over in one change; `@kstackz/ui-toolkit` and `@kstackz/pwa-toolkit` are deleted, not deprecated.

## Modules and Layers

### web-toolkit (`@kstackz/web-toolkit`, new)

**Responsibility.** The one Toolkit for web apps: UI, input, forms, Recipes, the optional PWA, and the opinionated client and server setup that connects auth-, rpc- and std-toolkit for the web.

**Change.** Created from ui-toolkit (less the devtools-only and sign-in-service blocks), pwa-toolkit, use-gesture's web part, use-keys, and Ledger's reusable web code. Built to `dist/`. Laymos layers and layer graph as in Requirements 1–11.

**Public behavior.** One subpath per layer. A new app: defines its API and handlers, its Session Lifetime, calls the `client` setup with them, uses its root document, composes `<SignedIn>`/`<SignedOut>` and the Frame, serves through `server`, and optionally adds `pwa`.

**Layers.**

- **theme:** tokens and CSS, the Theme cookie store and script, Status Bar Surface, `cn`. No TanStack Start.
- **feedback:** sound for gestures and Commands.
- **input:** device detection (touch, keyboard) with pre-paint script, `useDevice()`, CSS variants; web gestures (from use-gesture's `./web`); keys (from use-keys).
- **components:** shadcn copies with private `parts/`, icons, motion, general viewers.
- **form:** form hook and fields from ui-toolkit's `form`.
- **recipes:** Frame and Sidebar (from `blocks/app-shell` plus Ledger's Sidebar keys), Thumb Picker, Key Bar, Swipe Row, Sheet, Local Sign-In, Sign-In, User Switcher, Update Prompt, Install Prompt, Account Lost dialog, Gate Notice dialog. Each recipe with parts is its own module graph.
- **client:** root document and head, Theme server function, 404, extension points for `pwa`, the web Gate platform (IndexedDB with the Gate's device table, `?backend=`, lifecycle events, cross-tab announcements), `<WebApp>`, `<SignedIn>`, `<SignedOut>`, `useAuth()`, `useSession()`, session-bound helpers.
- **pwa:** everything from pwa-toolkit, plus manifest from the Theme, splash head and generator, Offline Fallback, plugging into `client`'s extension points.
- **server:** the `/rpc`-or-Start fetch handler, the per-request RPC-over-HTTP host (scope, NDJSON, Authz cookies), Cloudflare and alchemy defaults.

**Dependencies.** auth-toolkit (Gate, auth clients, Authz), rpc-toolkit (transports), std-toolkit (db, sync, browser platform), TanStack Start, `@kstackz/use-gesture` core.

**Testing.** Layer graph passes Laymos; an app without `pwa` emits no service worker or manifest; `<SignedIn>` subtree remounts on an Account Switch and nothing outside it does; `useSession()` throws outside `<SignedIn>`; Recipes render signed out; Sheet picks dialog or drawer by device; the server routes `/rpc` and pages.

### Gate (auth-toolkit, new `./gate`)

**Responsibility.** Running sign-in on one device for any app on any platform.

**Change.** Moved from `ledger/core`'s gate and app machine, with Ledger's types replaced by app-given lifetimes, and the behavior changes of Requirements 14–27.

**Public behavior.** Given a platform (a device-level table, lifecycle, other tabs), the Backends with their auth and connection, and the app's Backend Lifetime and Session Lifetime builders: the view, the Signed-in Accounts, the Active Account, the open Session Lifetime's services, Account Switch, Add User, Sign Out, Sign Out Everyone, change Backend, Local Sign-In's question, `takeNotice()`.

**Layers.** A new auth-toolkit layer for the Gate, above the auth client (`clients/auth`), with no platform code.

**Dependencies.** auth-toolkit's `Auth` (local and live), rpc-toolkit connections given by the app, XState. web-toolkit's `client` and expo-toolkit supply platform and React.

**Testing.** Open First on switch and launch (data on the next render, no network wait); launch shows every Remembered Account before the Backend answers, and the Backend's answer replaces them whole; Account Lost ends the lifetime, keeps the Copy, shows `accountLost` again after a reload, keeps the Copy on signing in to the same account and deletes it on opening another; signing out in another tab of this device is not an Account Lost; a cookie switched elsewhere is followed silently on the next check; offline Account Switch succeeds; Sign Out refused offline on the Remote Backend; Backend change closes Session then Backend Lifetime; interruption is not an error; rapid A→B→C leaves cookie on C; second open failure gives `unopenable`; other tabs follow at once.

### Std Sync (std-toolkit `sync`)

**Responsibility.** Synced Collections.

**Change.** Disposal waits, for a bounded time, for Mutation Callbacks in flight before stopping.

**Public behavior.** A write in flight when its Session Lifetime ends reaches the Backend if it can within the bound.

**Layers.** `std-sync` (dispose) and `collection` (tracking callbacks in flight).

**Dependencies.** None new.

**Testing.** Dispose during a slow Mutation Callback waits for it; past the bound, dispose finishes.

### expo-toolkit

**Responsibility.** The Toolkit for Expo apps.

**Change.** `patterns` renamed `recipes` (layer, subpath, docs). Adds the Expo Gate platform pieces and React wiring (`<SignedIn>`, `<SignedOut>`, `useAuth()`, `useSession()`) matching web-toolkit's, an Account Lost recipe and a Gate Notice recipe.

**Layers.** `recipes` (renamed, new Account Lost and Gate Notice recipes); a new top layer for the Gate wiring.

**Dependencies.** auth-toolkit Gate, std-toolkit Expo platform.

**Testing.** Ledger Expo opens, switches and signs out on the shared Gate.

### Ledger core (`@ledger/core`)

**Responsibility.** Ledger's domain, API, handlers and Session contents.

**Change.** Gate and app machine leave for auth-toolkit. Core gives the Gate Ledger's Session Lifetime (its collections and commands over the Session's connection) and its Backends' handlers; Ledger's own words (Active Session, Switch User) map onto the Gate's (Active Account, Account Switch).

**Layers.** `client/gate` and `client/domain/machine` removed; `client/platform` reduced to what the Gate's platform does not give; `client/state/session` builds the Session Lifetime.

**Testing.** Existing session, settings and server tests pass.

### Ledger web (`@ledger/web`)

**Responsibility.** Ledger's web app.

**Change.** Built on web-toolkit: its reusable code moves into the Toolkit (Requirement 36), its root route, shell and Worker entry become web-toolkit setup, it adds `pwa`.

**Testing.** Builds, deploys a preview, signs in, switches Users instantly, survives Account Lost with the dialog, works offline as before.

### Ledger Expo (`@ledger/expo`)

**Responsibility.** Ledger's native app.

**Change.** Runs on the shared Gate through expo-toolkit; `patterns` imports become `recipes`.

### devtools UI (`@devtools/ui`, new, private)

**Responsibility.** UI only devtools needs.

**Change.** Created at `devtools/ui` from the devtools-only blocks, built on web-toolkit. `@kstackz/devtools` lists it as a devDependency and bundles it.

**Testing.** `@kstackz/devtools`'s package smoke test passes with no `@devtools/ui` in its published dependencies.

### auth-toolkit sign-in app

**Responsibility.** The shared sign-in service's pages.

**Change.** Gets the sign-in-service screens from ui-toolkit's `blocks/auth`, with owned copies of the components and Theme they use. It does not depend on web-toolkit.

### Other apps (`apps/docs`, `apps/alchemy-console`)

**Change.** Move to web-toolkit. Whether each adds `pwa` (docs with the `content` Preset) is decided per app.

### Repo

**Change.** Delete ui-toolkit and pwa-toolkit; update the changeset `fixed` group, ADR 0001's Toolkit list, root and Toolkit `CONTEXT.md` files (pwa-toolkit's and ui-toolkit's glossaries move into web-toolkit's), READMEs per `docs/readme-conventions.md`, and `ledger/docs/parity.md`.

## Cross-Module Flow

The app's `client` setup hands the Gate (auth-toolkit) the web platform from `client`, the Backends (remote: `authLive` and an HTTP connection; local: `authLocal` and an in-process connection over the app's handlers), and the app's lifetime builders. `<WebApp>` holds the Gate unstarted. The first `useAuth()` or `<SignedIn>` starts it: it opens the Backend Lifetime, then by Open First the Session Lifetime of the active Remembered Account, which builds the app's Session (a Std Sync over the Session's connection); `<SignedIn>` renders the app's tree with `useSession()`. An Account Switch closes the Session Lifetime (Std Sync drains, then stops; calls in flight are interrupted silently), opens the next from its copy, and in the background switches the cookie, checks, and announces to other tabs. A check finding the account gone ends it as an Account Lost: the Gate shows `accountLost`, which the Account Lost recipe renders as a dialog that cannot be dismissed, and keeps the Copy until the User signs in to that account again or opens another. On the server, `server`'s fetch handler sends `/rpc` to the same handlers the Local Backend runs in the browser, with auth-toolkit's Authz resolving the bearer token. `pwa`, when added, plugs its head tags, provider and Offline Fallback into `client`.

## Implementation Decisions

- Name `@kstackz/web-toolkit`; layer names as in Requirement 1; the layout is copied from expo-toolkit (layers per job, subpath per layer, owned copies behind a module graph, private `parts/`).
- The layout recipe is the **Frame**; **App Shell** keeps its PWA meaning.
- The layer named `client` matches pwa-toolkit's **Client** (the app's side in one open page).
- The Gate lives in auth-toolkit, using auth-toolkit's words: Signed-in Account, Active Account, Account Switch, Backend Lifetime, Session Lifetime.
- The PWA is opt-in and plugs into `client`.
- Server: plain fetch handler, Cloudflare and alchemy as the default.
- Multi-account and the Local Backend on by default; the "every account's lifetime open" option is not built.
- Unsaved writes: Std Sync drains on dispose; no prompt, no counting in the Gate.
- Only HTTP and in-process connections are built now.
- ADR: `docs/adr/0003-web-toolkit-and-the-gate.md`.
- Strict direction: web-toolkit imports auth-toolkit; auth-toolkit never imports web-toolkit, not even as a devDependency. auth-toolkit's sign-in app owns the UI it needs (its own component copies and Theme), as web-toolkit owns its own.

## Out of Scope

- How `form` and `input` work together (deferred).
- WebSocket or Durable Object connections.
- Keeping every Signed-in Account's Session Lifetime open.
- Storing unconfirmed writes in the Sync Replica.
- Loading the Local Backend's code eagerly for apps without the PWA.

## Unresolved

- None blocking. Defaults taken: `client` API names `createWebApp`, `<WebApp>`, `<SignedIn>`, `<SignedOut>`, `useAuth`, `useSession` (to be judged on Ledger); `server`'s alchemy defaults are Ledger's (D1, a domain per stage, deploy guard); `apps/docs` and `apps/alchemy-console` stay without `pwa`; Std Sync waits 5 seconds on dispose.
