# Monorepo

Published packages for building full-stack Effect apps under the kstack umbrella, designed to work together.

## Language

**kstack**:
The umbrella name for the packages in this repo that make up one stack, published under the `@kstackz` npm scope.
_Avoid_: brand, kstackz (as a name), pkishorez packages

**Toolkit**:
A kstack package covering one area of an app (data, AI, RPC, auth, running an app), named `@kstackz/<area>-toolkit`. rpc-, auth- and std-toolkit are the platform-free first principles the rest build on. A Toolkit never knows which platform it runs on.
_Avoid_: kai-toolkit, kui-toolkit, unscoped toolkit names, web-toolkit and expo-toolkit (those are now Platforms)

**Platform Toolkit**:
The Toolkit for running an app on any platform, `@kstackz/platform-toolkit`: the Gate, the Session, the two Backends and what an app configures, with nothing of the web or of Expo in it. The area Toolkits are its parts; the Platforms are its only direct users.
_Avoid_: app toolkit, gate toolkit, core

**Platform** (package):
An opinionated way of building an app on one kind of device with the Platform Toolkit: the Web Platform or the Expo Platform. A Platform decides what every app of its kind gets without asking; an author who wants none of it uses the Toolkits directly.
_Avoid_: platform toolkit (that is the shared one), framework, starter

**Web Platform**:
The Platform for web apps, `@kstackz/web-platform`: a PWA on TanStack Start, with the Theme, a Session per Account and the Account Switcher when auth is configured, the opinionated server, and the UI, input, Recipes, gestures and keys to build screens. Replaces the Web Toolkit.
_Avoid_: web-toolkit (the former name), ui-toolkit, pwa-toolkit, frontend

**Expo Platform**:
The Platform for native apps built with Expo, `@kstackz/expo-platform`: the same Session and Account Switcher as the Web Platform, with OAuth sign-in, SQLite, haptics, and what only a phone has. Consistent with the Web Platform in what a user experiences, not identical in code. Replaces the Expo Toolkit.
_Avoid_: expo-toolkit (the former name), native platform, mobile platform

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

**Recipe**:
One whole interaction a Platform ships ready to use, such as the Sidebar, the Thumb Picker or Local Sign-In. A Recipe in the Web Platform and one in the Expo Platform with the same name are the same interaction on two platforms.
_Avoid_: pattern, block, widget

**Backend**:
What answers an app's API: one Layer of handlers that does not know where it runs. Given the cloud versions of its Services it is the **cloud Backend**, on a Cloudflare Worker; given the device versions it is the **device Backend**, in the app itself. The two were formerly the Remote Backend and the Local Backend.
_Avoid_: Remote Backend, Local Backend, server

**Service**:
One thing a Backend needs, such as a table or who signed a call, with a `cloud` and a `device` version. Which versions it is given decides where the Backend runs. auth-toolkit's resolver (`authz.cloud`, `authz.device`) is one.
_Avoid_: adapter, edge, resolver (as a separate idea)

**Session**:
What an app keeps for one Account while it is active, written once as a function of the Session Context and made a service by the Platform. Opened when the Account becomes active and closed when it stops being active; closing interrupts every call still in flight, so everything under `SignedIn` starts afresh on a switch. Only an app with auth has one.
_Avoid_: session store, user store, Backend Link, Session Lifetime, better-auth's session (that is a Sign-in)

**Session Context**:
What the Platform Toolkit gives a Session to be built from: the app's APIs signed as the Account, the user's Std Sync, the Account, and the Session Status. Typed by the app's APIs.
_Avoid_: session input, session deps

**Session Status**:
Whether the open Account has been confirmed by its Sign-in since the Session opened: verifying or verified, with when it was last verified. A call made while verifying waits for the token; nothing fails for being early.
_Avoid_: auth state, loading, confirmed (the word for the Account, not the status)

**API**:
One of an app's named ways to call a Backend: a group and the Transport it is reached by, such as `ledger: Rpc.http(LedgerApi, { path: '/rpc' })`. A path is resolved by the Platform against the cloud address; a full URL is left alone. Every API is signed by the one auth; which calls need it is the Guard's business.
_Avoid_: endpoint, service, client

**Open First**:
The Gate opening the remembered active Account at once, before its Sign-in has answered, and confirming it behind.
_Avoid_: optimistic login, cached login

**Account Lost**:
The open Account no longer among those its Sign-in lists, and not signed out from this device. The user signs in to it again, keeping its Std Sync, or opens another Account, deleting it.
_Avoid_: session expired, logged out elsewhere

**Cache**:
What only this device has and belongs to no user, such as an app's Settings.
_Avoid_: a user's Std Sync (that is the user's data, which lives on the Backend)

**Host**:
Everything the Platform Toolkit needs of where an app runs, as a Platform gives it: its Storage, its cloud Sign-in and address, its lifecycle (online, foreground, launch), and its other tabs if it has any. An app never meets it. Formerly the Platform interface.
_Avoid_: Platform (now the package kind), environment, LedgerPlatform, GatePlatform

**Storage**:
Where a Host keeps things: a Std Table adapter and a Sync adapter for the same place, such as IndexedDB in a browser or SQLite on a phone.
_Avoid_: persistence, database (that is one named place inside Storage)

**Sync adapter**:
Where a Std Sync is kept: `Sync.idb`, `Sync.sqlite` or `Sync.memory`. Whether that place is shared by other tabs, and so needs leadership and a doorbell, is the adapter's business.
_Avoid_: sync platform, StdSyncPlatform, browser platform

**Stand-alone tool**:
A package from this repo that is useful without kstack and keeps its own unscoped name, such as `laymos` or `use-effect-ts`.

**Re-export package**:
A package that depends on every Toolkit and only re-exports them. Considered and rejected for kstack.
_Avoid_: umbrella package, meta-package
