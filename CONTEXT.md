# Monorepo

Published packages for building full-stack Effect apps under the kstack umbrella, designed to work together.

## Language

**kstack**:
The umbrella name for the packages in this repo that make up one stack, published under the `@kstackz` npm scope.
_Avoid_: brand, kstackz (as a name), pkishorez packages

**Toolkit**:
A kstack package covering one area of an app (data, AI, RPC, auth) or one platform (web, Expo), named `@kstackz/<area>-toolkit`. rpc-, auth- and std-toolkit are the platform-free first principles the rest build on.
_Avoid_: kai-toolkit, kui-toolkit, unscoped toolkit names

**Door**:
One subpath of a Toolkit, named for the side that imports it, such as auth-toolkit's `worker`, `guard`, `server` and `client`. What a door exports is assembled from parts that stay exported underneath for the unusual app.
_Avoid_: entry point, barrel, layer (that is Laymos's word)

**Transport**:
How an Api is called and served: `http`, `websocket` or `inProcess`, each a client and server pair in rpc-toolkit with the protocol fixed, so the two always agree.
_Avoid_: protocol (never chosen by a consumer), connection

**Middleware**:
Something attached to an Api or one of its calls that both sides agree on, with a declaration, a server half and an optional client half. One mechanism for Effect RPC and Effect HttpApi.
_Avoid_: Cannotation (the former name), annotation, interceptor

**Guard**:
auth-toolkit's Middleware, `Authz`: which calls need a signed-in user, which policy they pass, and how a client signs a call.
_Avoid_: Auth Cannotation, authz middleware

**Sign-in**:
How an Account proves who it is, named by mechanism: `cookie` (a browser against the sign-in service), `oauth` (a phone as the app's fixed OAuth client), `named` (by name, on the device Backend) or `deviceCode` (a CLI).
_Avoid_: auth live, auth expo, auth local, login method

**Account**:
One user signed in on this device, with their token. Several can be signed in at once; one is active.
_Avoid_: Signed-in Account, OpenAccount, GateUser, remembered account, local account

**Named Account**:
An Account on the device Backend, signed in by choosing any name; the same name is always the same user. Its token is a Name Token, which no one verifies.
_Avoid_: Local Account, Local Token, local sign-in, test user

**Expo Toolkit**:
The one Toolkit for native apps built with Expo, `@kstackz/expo-toolkit`: their UI, gestures, haptics and sound, and the phone as an app's Platform. What only differs in where data is kept or how a User signs in stays in the Toolkit for that area, as one more target of it.
_Avoid_: expo-ui-toolkit, native toolkit, mobile toolkit

**Web Toolkit**:
The one Toolkit for web apps, `@kstackz/web-toolkit`: their UI, input, forms, Recipes, the optional PWA, and the opinionated client and server setup. It connects the area Toolkits for the web (sign-in, the Backend, data) without containing or re-exporting them.
_Avoid_: ui-toolkit, pwa-toolkit (the two packages it replaces), frontend toolkit

**Recipe**:
One whole interaction a platform Toolkit ships ready to use, such as the Sidebar, the Thumb Picker or Local Sign-In. A Recipe in the Web Toolkit and one in the Expo Toolkit with the same name are the same interaction on two platforms.
_Avoid_: pattern, block, widget

**Backend**:
What answers an app's API: one Layer of handlers that does not know where it runs. Given the cloud versions of its Services it is the **cloud Backend**, on a Cloudflare Worker; given the device versions it is the **device Backend**, in the app itself. The two were formerly the Remote Backend and the Local Backend.
_Avoid_: Remote Backend, Local Backend, server

**Service**:
One thing a Backend needs, such as a table or who signed a call, with a `cloud` and a `device` version. Which versions it is given decides where the Backend runs. auth-toolkit's resolver (`authz.cloud`, `authz.device`) is one.
_Avoid_: adapter, edge, resolver (as a separate idea)

**Session**:
What an app's client keeps for one Account while it is active: a signed `rpc` client and a `sync` named for the user, which `createApp` hands the app's session function, and whatever the app builds on them. Opened when the Account becomes active and closed when it stops being active, so everything under `SignedIn` starts afresh on a switch.
_Avoid_: session store, user store, Backend Link (the former per-Backend part, now inside createApp), Session Lifetime, better-auth's session (that is a Sign-in)

**Cache**:
What only this device has and belongs to no user, such as an app's Settings.
_Avoid_: a user's Std Sync (that is the user's data, which lives on the Backend)

**Platform**:
Everything an app needs of where it runs, as `createApp` takes it: its Storage, its cloud Sign-in and address, its lifecycle (online, foreground, launch), and its other tabs if it has any. The web and Expo Toolkits each give one; until they are rebuilt on the new doors (ADR 0005), each app builds its own.
_Avoid_: LedgerPlatform, environment, AppPlatform, GatePlatform, sync platform (that is a Sync adapter)

**Storage**:
Where a Platform keeps things: a Std Table adapter and a Sync adapter for the same place, such as IndexedDB in a browser or SQLite on a phone.
_Avoid_: persistence, database (that is one named place inside Storage)

**Sync adapter**:
Where a Std Sync is kept: `Sync.idb`, `Sync.sqlite` or `Sync.memory`. Whether that place is shared by other tabs, and so needs leadership and a doorbell, is the adapter's business.
_Avoid_: sync platform, StdSyncPlatform, browser platform

**Stand-alone tool**:
A package from this repo that is useful without kstack and keeps its own unscoped name, such as `laymos` or `use-effect-ts`.

**Re-export package**:
A package that depends on every Toolkit and only re-exports them. Considered and rejected for kstack.
_Avoid_: umbrella package, meta-package
