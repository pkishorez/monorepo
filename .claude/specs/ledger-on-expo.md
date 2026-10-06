# Spec: ledger-on-expo

Source: `this conversation`

## Problem

Every app-facing Toolkit so far (ui-toolkit, pwa-toolkit, use-gesture, use-keys) is built for the browser, and Ledger, the app that is the blueprint for every kstack app, runs only in the browser. std-toolkit and the Ledger domain are already platform-agnostic, but there is no way to build a native app with kstack, and Ledger's shared logic is locked inside one web app package. The goal is a working native Ledger on iOS and Android, built with Expo, that proves the kstack blueprint carries over, while keeping web and native cleanly separated.

## Outcome

- A top-level `ledger/` folder holds three private packages: `@ledger/core`, `@ledger/web` (today's `apps/kstack`, unchanged in behaviour) and `@ledger/expo`.
- A new `@kstackz/expo-toolkit` provides the native UI (Panel UI components owned as source), gestures, haptics, sound and theme, organised into Laymos layers, layer graphs, modules and module graphs. It is the blueprint for a later Web Toolkit.
- std-toolkit gains an expo-sqlite target; auth-toolkit gains a native Auth target that signs in with Device Login; use-gesture splits into a platform-agnostic core and a `/web` subpath.
- A development build of `@ledger/expo` runs on the iOS Simulator and a phone: the same Places, Commands, Thumb Lock and Place Picker, on the Local Backend (offline, SQLite) or the Remote Backend (the deployed `@ledger/web`'s `/rpc`, signing in with Google through Device Login), with several Users signed in at once.

## Requirements

1. The Expo app is the same Ledger product: same Users, Backends, Places, Sections, Commands, Thumb Lock and Place Picker, with a native shell.
2. The Expo app targets iOS and Android only. Web stays on the TanStack Start app; no Expo web build.
3. Ledger lives in `ledger/` with `core`, `web` and `expo` packages named `@ledger/core`, `@ledger/web`, `@ledger/expo`, all private. `pnpm-workspace.yaml` includes `ledger/*`.
4. `@ledger/web` is full stack: client, the Worker serving the Remote Backend's `/rpc`, and infra, deployed in one go. `@ledger/expo` hosts no server; its Remote Backend is the deployed web app's `/rpc`.
5. Dev builds of the Expo app use the local stage: `@ledger/web` run with `alchemy dev` at `kstack.kishore.computer`, and the Auth Worker from the `mine` monorepo (`~/CAREER/MINE/mine/packages/auth`, `pnpm dev`) at `auth.kishore.computer`, both served by portless; `EXPO_PUBLIC_REMOTE_URL` overrides the Remote Backend URL. The simulator/emulator must trust portless's certificate. The `mine` working copy has the user's uncommitted edits: never modify them; any change there goes on a separate branch/worktree.
6. Both apps run the Local Backend on the device: IndexedDB on web, SQLite on native.
7. One Expo Toolkit, `@kstackz/expo-toolkit`, covers UI, gestures, haptics, sound and theme, as subpath entry points. Data storage and sign-in differences stay in std-toolkit and auth-toolkit as extra targets.
8. Panel UI is copied into the Expo Toolkit as source with its CLI and owned from then on; only the components Ledger needs are copied.
9. The Expo Toolkit's theme layer carries the token names; Ledger supplies its own values from its design, so Ledger looks like the same product on both platforms.
10. use-gesture's root export becomes the platform-agnostic core (pointer samples, direction, recognizers including swipe and Thumb Lock); today's DOM input, motion zone and DOM patterns move to a `/web` subpath. The core carries no DOM `Element` or motion-value types. The Expo Toolkit's input layer feeds the core from Gesture Handler touches.
11. Native navigation uses Expo Router; each Place is a route, and Go calls the router.
12. Native is Gestures only: Settings hides Keys where there is no keyboard. Hardware keyboards come later.
13. Gesture Haptics: a light tap as the Thumb Lock arms, a tick at each Step, a firmer tap when it goes, none on a Wrong Way, with its own Settings switch apart from Sounds.
14. Sounds on native are made on demand through `react-native-audio-api` (Web Audio on native), so they match web. Its working in a dev build must be confirmed before committing to it.
15. A native app obtains each User's Session through Device Login, opened in an in-app browser with the code filled in, and receives the token by polling over HTTPS (auth-toolkit ADR 0017). No `@better-auth/expo`, no OAuth PKCE, no deep link or app scheme.
16. The native Session Store is the device's secure storage, one entry per User per Auth Worker, readable only while the device is unlocked and never backed up. Sign Out revokes that Session on the Auth Worker and deletes it from the device.
17. The Device Screen names the program asking ("Ledger on iPhone") and keeps its Continue step; device codes expire within minutes; the Auth Worker's sign-in and device endpoints are rate limited.
18. pnpm keeps its default isolated layout; hoisting is a fallback applied only if a library breaks.
19. One React and one React Native across the repo: the catalog's React is pinned to the version Expo's SDK pins, and Expo's SDK cycle sets React upgrades.
20. Development uses a dev build (`expo run:ios` / `run:android` or an EAS development build); Expo Go compatibility is not a goal.
21. Every new or reshaped package is organised and linted with Laymos: layers, layer graphs, modules and module graphs that separate features cleanly.
22. Order of work: split `apps/kstack` into `ledger/core` + `ledger/web` with no behaviour change first, proven by the web tests and Laymos lint; then the std-toolkit and auth-toolkit Expo targets and the use-gesture split; then the Expo Toolkit; then `@ledger/expo`.

## Modules and Layers

### Workspace

**Responsibility.** The pnpm workspace, catalogs and repo-wide versions.

**Change.** Add `ledger/*` to the workspace; add the Expo, React Native and native library versions to the catalog; pin the catalog's React and react-dom to the version the chosen Expo SDK pins.

**Public behavior.** `pnpm install` succeeds with isolated `node_modules`; one copy of `react` and of `react-native` in the graph.

**Layers.**

- **Workspace config:** `ledger/*` package glob; catalog entries for `expo`, `react-native`, `expo-router`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`, `expo-sqlite`, `expo-secure-store`, `expo-web-browser`, `expo-haptics`, `react-native-audio-api`, `uniwind`, Panel UI's required peers; `allowBuilds` decisions for any new install scripts; `minimumReleaseAge` respected.

**Dependencies.** Expo SDK 57 (React Native 0.86, React 19.2.x).

**Testing.** `pnpm install`, `pnpm lint:syncpack`, `pnpm why react-native` shows one version.

### `@ledger/core`

**Responsibility.** Everything both Ledger apps share: the words of money and the Ledger API, the Backend's domain, the Local Backend, the client's domain, state, Backends, Gate, and the Command vocabulary with its gesture data.

**Change.** New package, moved out of `apps/kstack/src`. Every platform-specific dependency becomes a port the app fills: table storage for the Local Backend, local Accounts, Settings and copies; the sync platform; the Remote Backend's `Auth`; the Remote Backend's URL; lifecycle (online, in view); a small key-value store (last User); copy listing and deletion. The Gate loses its `window`/`history`/`document` hooks. Commands keep what each Command is, where it works, and the gesture data; binding Commands to keys with use-keys moves to web.

**Public behavior.** Entry points for each exposed module, such as `@ledger/core/gate`, `/commands`, `/backends/local`, `/backends/remote`, `/ledger`, `/ledger-api`, `/server-domain`. Behaviour of the web app is unchanged after the move.

**Layers.**

- **shared:** the words of money and the Ledger API, moved unchanged.
- **server-domain:** storage, ledger handlers and the Backend Layer, moved unchanged.
- **server-local:** the Local Backend, with its table storage taken from a port instead of IndexedDB.
- **client-domain:** Settings (including the Gesture Haptics switch), Session and the app machine, moved; Settings gains the Gesture Haptics switch.
- **client-state:** Session, Settings and local copies, with storage, sync platform, lifecycle and copy store taken from ports.
- **client-backends:** the Local and Remote Backends' client halves, with `Auth`, storage, sync platform, key-value store and Remote URL taken from ports.
- **client-gate:** Backend choice and switching, with lifecycle from a port.
- **client-commands:** the Command vocabulary and gesture data, with no DOM, Tailwind, Web Audio or `navigator`.
- **ports (new, bottom):** the contracts each app fills.

Layer graph: `gate → backends → state → domain → shared`; `backends → server-local → server-domain → shared`; `commands` beside them; every layer may reach `ports`.

**Dependencies.** std-toolkit, auth-toolkit (`clients/auth`, server resolvers), rpc-toolkit, effect, xstate, `@tanstack/react-db`, react.

**Testing.** The tests moved from `apps/kstack` (ledger sums, commands, machine, session, local copies) pass in core; Laymos lint passes; nothing in core imports DOM, Vite or React Native APIs.

### `@ledger/web`

**Responsibility.** The full-stack web Ledger: TanStack Start client, the Worker serving `/rpc` for the Remote Backend, and infra.

**Change.** `apps/kstack` moves to `ledger/web` and depends on `@ledger/core`. It keeps `entry-web`, `entry-worker`, `entry-infra`, `server-remote`, `client-screens` and its own `client-kit` (Thumb Picker, sound, input) until a Web Toolkit absorbs them. It adds a `platform` layer: core's ports filled with IndexedDB, the browser sync platform, `authLive`, `localStorage`, window lifecycle and Vite env. Key bindings over use-keys live here.

**Public behavior.** Identical to today at kstack.kishore.app; deploys the same way.

**Layers.**

- **entry-web / entry-worker / entry-infra / server-remote:** moved unchanged, importing core.
- **client-screens / client-kit:** moved, importing core's commands and gate.
- **platform (new):** the web ports.

Layer graph: `entry → screens → platform → @ledger/core`; `entry-worker → entry-infra, server-remote → @ledger/core` server layers.

**Dependencies.** `@ledger/core`, ui-toolkit, pwa-toolkit, use-gesture (`/web`), use-keys, alchemy.

**Testing.** All existing web tests, `tsc`, Laymos lint and colour lint pass; dev server and a dev deploy work.

### `@ledger/expo`

**Responsibility.** The native Ledger app for iOS and Android.

**Change.** New Expo app. Expo Router routes for each Place; a native shell with the Sidebar, User Switcher, the Thumb Lock and Place Picker from the Expo Toolkit, the Add sheet, Settings with its Sections; Splash on launch. A `platform` layer fills core's ports: expo-sqlite tables, the native sync platform, native `Auth` (Device Login), the Remote URL (dev stage by default, `EXPO_PUBLIC_REMOTE_URL` override), `AppState`/network lifecycle, and a key-value store.

**Public behavior.** A dev build opens on the Splash, then Home. On the Local Backend, a User signs in by name and their money stays on the phone. On the Remote Backend, Add User opens the Device Screen in an in-app browser; after Continue the User is signed in and their money syncs with the web app. Switch User, Sign Out, Add, Go, Jump, Next/Previous and the Thumb Lock work as on web; Keys are hidden.

**Layers.**

- **entry:** Expo Router layout and routes, one thin route per Place.
- **screens:** Places, sheets, shell and parts, built from Expo Toolkit components.
- **platform:** the native ports.

Layer graph: `entry → screens → platform → @ledger/core`.

**Dependencies.** `@ledger/core`, expo-toolkit, std-toolkit (`db/sqlite/expo`, `sync/platform/expo`), auth-toolkit (`clients/auth` native target), the deployed `@ledger/web` and Auth Worker.

**Testing.** Launches in a dev build on the iOS Simulator; each Place reachable by Go and by the Thumb Lock; an Entry added on the Local Backend survives a restart; on the Remote Backend an Entry added on the phone appears on web and vice versa; two Users signed in, Switch User keeps each User's money separate; Sign Out removes the User's copy and revokes the Session.

### `@kstackz/expo-toolkit`

**Responsibility.** The one Toolkit for native Expo apps: UI, gestures, haptics, sound and theme. The blueprint for a later Web Toolkit.

**Change.** New Toolkit in `toolkits/expo-toolkit`, versioned with the other kstack packages.

**Public behavior.** Subpath entry points: `/theme`, `/components/*`, `/input`, `/feedback`, `/patterns/*` (Thumb Picker, Sidebar, sheet, Key Bar). Native peers are optional per entry point.

**Layers.**

- **theme:** Uniwind tokens, fonts, light and dark; token names only, values from the app.
- **components:** Panel UI components copied as source; a module graph records which components use which.
- **input:** Gesture Handler touch tracking feeding use-gesture's core; the Thumb Lock recognizer wired to two pointers.
- **feedback:** haptics through `expo-haptics`; sound made on demand through `react-native-audio-api`.
- **patterns:** Thumb Picker (the walk moved from web's kit with its tests, and a native Place Picker), Sidebar with its own screen edge, sheets, Key Bar.

Layer graph: `patterns → components, input, feedback`; `components → theme`; `input`, `feedback` and `theme` depend on no other layer.

**Dependencies.** use-gesture core, Panel UI's peers (reanimated, worklets, gesture-handler, safe-area-context, svg, uniwind, tailwindcss), expo-haptics, react-native-audio-api.

**Testing.** The Thumb Picker walk tests pass; Laymos lint passes; Panel UI components render in the Ledger dev build; `react-native-audio-api` confirmed working in a dev build.

### `@kstackz/use-gesture`

**Responsibility.** Gesture recognition shared by web and native.

**Change.** Root export becomes the platform-agnostic core: pointer samples, direction, recognizers (swipe, Thumb Lock). DOM pointer input, the motion zone, and DOM patterns (sidebar, pull-to-refresh) move to a `/web` subpath. `Pointer`, `Tracker` and `Pointers` stop carrying DOM `Element` and motion values.

**Public behavior.** Web callers import from `/web`; the Expo Toolkit imports the root.

**Layers.**

- **core:** agnostic samples, tracker and direction.
- **recognizers:** agnostic decision logic.
- **web:** DOM input, zone and patterns.

**Dependencies.** motion and react-dom only under `/web`.

**Testing.** Existing recognizer, zone and pattern tests pass; the root entry has no DOM or motion import.

### `@kstackz/std-toolkit`

**Responsibility.** Data: tables, adapters and sync.

**Change.** Add an expo-sqlite `SQLiteDriver` as `db/sqlite/expo`, beside the D1 and other drivers. Add a native sync platform, `sync/platform/expo`: a SQLite store, no leadership and no doorbell (one process), plus listing and deleting copies.

**Public behavior.** `StdTable`s and `createStdSync` run on a phone with SQLite; copies can be listed and deleted as on web.

**Layers.**

- **db/sqlite drivers:** the expo-sqlite driver.
- **sync/platform:** the native platform.

**Dependencies.** expo-sqlite as an optional peer.

**Testing.** The SQLite table conformance tests run against the driver contract; the native platform passes the sync platform contract tests where they can run off-device; Ledger's dev build exercises both.

### `@kstackz/auth-toolkit`

**Responsibility.** Sign-in for First-Party and Third-Party programs.

**Change.**
- A native target of the `Auth` service in `clients/auth`, implementing list, sign in, Switch, sign out and sign out all. Signing in runs Device Login: request a device code, open the Device Screen with the code filled in through an in-app browser, poll for the Session token, close the browser. Each User's Session token is kept in a Session Store on secure storage.
- The non-Node parts of `clients/cli`'s Device Login move into a shared core that both the CLI and the native target use, each with its own Session Store and browser opener.
- The Device Screen names the program asking and keeps its Continue step.
- Device codes expire within minutes.
- Rate limiting is on for the sign-in and device endpoints.

**Public behavior.** A native app gets the same `Auth` service as web, so `@ledger/core` uses it unchanged. Several Users can be signed in on one phone. Sign Out revokes the Session on the Auth Worker.

**Layers.**

- **clients/auth:** the native target.
- **clients/cli:** reuses the shared Device Login core.
- **auth-worker:** Device Screen naming the requester; device-code expiry; rate limiting.

**Dependencies.** expo-secure-store and expo-web-browser as optional peers; the Auth Worker's `deviceAuthorization` and `bearer` plugins.

**Testing.** The native target's sign in, Switch and sign out run against a memory Auth Worker with a fake browser opener and Session Store; the CLI's tests still pass; rate limits are enforced on the device and sign-in endpoints.

## Cross-Module Flow

`@ledger/expo`'s entry starts Expo Router and its `platform` layer builds core's ports from std-toolkit's expo-sqlite driver and native sync platform, auth-toolkit's native `Auth`, the Remote URL and `AppState` lifecycle. `@ledger/core`'s Gate reads the Backend from Settings and runs the app machine on that Backend's Layer.

On the Local Backend, core's server-local runs the Backend's domain in-process over SQLite with `resolverLocal`.

On the Remote Backend:
1. Add User calls the native `Auth`, which runs Device Login against the Auth Worker and stores the Session token.
2. The Session signs every `/rpc` call to the deployed `@ledger/web` Worker with that token as a bearer.
3. That Worker resolves the token through the Auth Worker and serves the Backend's domain over D1.
4. The User's copy syncs into SQLite on the phone.

Screens read core's commands and gate. The Expo Toolkit's Thumb Picker turns Gesture Handler touches, through use-gesture's core, into Steps and Go, with Gesture Sounds and Gesture Haptics from its feedback layer.

## Implementation Decisions

- Folder and package names: `ledger/{core,web,expo}` as `@ledger/core`, `@ledger/web`, `@ledger/expo`, private (Ledger ADR 0009).
- One Expo Toolkit, `@kstackz/expo-toolkit`, in `toolkits/`, with subpath entry points; ui-toolkit and pwa-toolkit keep their names until a later Web Toolkit cleanup.
- Panel UI owned as source in the Expo Toolkit.
- Native sign-in is Device Login (auth-toolkit ADR 0017); tokens stored with "this device only, when unlocked".
- The Thumb Picker walk lives in the Expo Toolkit and, until the Web Toolkit, also in web's kit.
- Expo SDK 57; dev build only; isolated pnpm layout; React pinned to Expo's.
- Sounds through `react-native-audio-api`; Gesture Haptics with its own switch.

## Out of Scope

- An Expo web build, or retiring the TanStack Start web app.
- The Web Toolkit cleanup (merging ui-toolkit, pwa-toolkit, use-gesture's web parts and use-keys).
- Moving the web app away from the `multiSession` plugin to one token per User.
- Hardware keyboard Keys on iPad.
- App Store or Play Store publishing, universal links, Expo Go compatibility.
- `@better-auth/expo`, OAuth PKCE for First-Party apps.

## Unresolved

- Which Panel UI components Ledger needs is decided while building the screens.
- Whether `react-native-audio-api` works in the dev build; if not, recorded sound files through `expo-audio` is the fallback raised in the conversation.
- The rate limits and device-code lifetime values.
