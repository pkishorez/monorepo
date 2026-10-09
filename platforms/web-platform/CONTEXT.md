# Web Platform

The way to build a kstack app: one config made into a PWA on TanStack Start, with its Theme, its APIs on a cloud or a device Backend, several Accounts signed in on one device with one Session each, its cache, the screens before sign-in, and the look, input, components and Recipes to build its screens.

## Language

### The app

**Host**:
Everything the Web Platform needs of where an app runs: its Storage, its cloud address and Sign-in, its lifecycle (online, foreground, launch), and its other tabs. The browser gives it; tests give one in memory. An app never meets it.
_Avoid_: platform, environment, AppPlatform

**API**:
One of an app's named ways to call a Backend: a group and the Transport it is reached by, such as `ledger: Api.http(LedgerApi, { path: '/rpc' })`. A path is resolved against the cloud address; a full URL is left alone. Every API is signed by the one auth; which calls need it is the Guard's business.
_Avoid_: endpoint, service, client, Api (the former single group)

**Backend**:
What answers an app's APIs: the cloud Backend or the device Backend. Each has its own Accounts; changing Backend signs no one out of either. The same handlers run on both; only the Services they are given differ.
_Avoid_: server, environment, mode

**Cloud Backend**:
The Backend run on a server, where Users sign in through the sign-in service and their data is kept for every device. Formerly the Remote Backend; a stored or launched `remote` is read as `cloud`.
_Avoid_: Remote Backend, real backend, production

**Device Backend**:
The Backend run in the app itself, every API's handlers in this process, where Users sign in as Named Accounts and their data never leaves the device. An app has it for every API or not at all. Formerly the Local Backend; a stored or launched `local` is read as `device`.
_Avoid_: Local Backend, demo, mock backend, offline mode

**Public Call**:
A call to an API outside any Session, signed as nobody: it goes out if the call is not guarded, and fails Unauthenticated without being sent if it is.
_Avoid_: anonymous request, unsigned API

**Cache**:
What only this device has and belongs to no user, such as an app's Settings. Neither the Backend nor a User's Sync holds it.
_Avoid_: local storage, preferences store

### Accounts

**Gate**:
What runs an app's sign-in on one device: which Backend it is on, which Accounts there are, and which is the Active Account, whose Session it keeps open. Every screen asks it whether someone is signed in; nothing starts until one first asks. Only an app with auth has one.
_Avoid_: auth gate (it is more than a check), app machine, session manager

**Open First**:
The Gate's rule for an account it already knows: on an Account Switch, or at launch with an Active Account remembered, its Session opens at once from what the device keeps, and the Backend confirms it afterwards. Only a device that knows nobody waits for the Backend.
_Avoid_: optimistic switch, eager open, cached login

**Remembered Accounts**:
The Accounts on one Backend as of the Gate's last check, kept by the device, with no tokens, so the Gate can show them and Open First before the Backend answers. Every answer from the Backend replaces them whole; they never hold an account the Backend did not name.
_Avoid_: account cache (Cache is what belongs to no user), multi-session, device sessions

**Account Lost**:
The Gate finding that the Active Account is no longer signed in, because it expired or was signed out on another device or app. The User must sign in to it again, keeping its User's Sync, or switch to another account, deleting it. Signing out on this device is never an Account Lost.
_Avoid_: kicked out, session expired, forced logout

**Gate Notice**:
A message the Gate leaves for the app once, such as a sign-in that came back without signing anyone in. An Account Lost is not one: it holds the app until the User acts.
_Avoid_: event, alert, login error (one kind of Gate Notice)

### Sessions

**Session**:
What an app keeps for one Account while it is active, written once with `defineSession` as a function of the Session Context. Opened when the Account becomes active and closed on an Account Switch, a sign-out or a change of Backend; closing interrupts every call still in flight, so nothing of one Account reaches another's screen.
_Avoid_: session store, user store, Backend Link, better-auth's session (that is a Sign-in)

**Session Context**:
What the Web Platform gives a Session to be built from: every API signed as the Account, the User's Sync, the Account, and the Session Status. Typed by the app's APIs.
_Avoid_: session input, session deps

**Session Status**:
Whether the open Account has been confirmed by its Sign-in since the Session opened: verifying or verified, with when it was last verified. A call made while verifying waits for the token; nothing fails for being early.
_Avoid_: auth state, loading

**Session Closed**:
What a run in a Session rejects with when the Session closed first. Retrying and timing out a call are the caller's business, never the Session's.
_Avoid_: cancelled, aborted

**User's Sync**:
The Std Sync of one user's data on the device, so it opens at once and offline, named for the user by `syncName`. On the cloud Backend it is deleted once the user is no longer signed in.
_Avoid_: copy, cache (Cache is what only the device has), replica

### Theme and layout

**Theme**:
The shared light or dark appearance used by KUI-based applications. The preference is stored in a user-readable cookie shared by sibling application hosts; without that cookie, the Theme is dark.
_Avoid_: color mode, system theme

**Status Bar Surface**:
The opaque strip at the top edge of an app that nothing covers, in the Theme's background or in the color of whatever the app shows up there, such as a sidebar behind a page moved aside. An installed iOS web app colors its status bar from it rather than from the declared theme color, so it is what makes the status bar follow a Theme switch.
_Avoid_: header background, notch fill

**Frame**:
The layout every app screen sits in: the Status Bar Surface, the Sidebar, and the header with its title and actions. On touch the Sidebar pushes the page aside; with a keyboard it stays beside it.
_Avoid_: app shell (the PWA's App Shell is what boots offline), layout, chrome

### Client

**Root Plugin**:
Something the root document takes in without knowing it: head tags for every page, and a provider around every page. The PWA and the named sign-in dialog plug in this way; `createApp` gives both to every app.
_Avoid_: extension, middleware, addon

**Live Object**:
A Durable Object that serves one of an app's WebSocket APIs to one user: their store, and where every one of their sockets connects, so a change one device makes is pushed to the others as it is made. It sleeps between messages and resumes its open streams when it wakes. Every call on it is still checked.
_Avoid_: room, channel, actor

**Gate Screens**:
What an app shows in place of what needs an Account until one is open: checking, opening, signing out, signed out with the way to the other Backend, and an Account that would not open. `SignedIn` shows them unless the app gives its own.
_Avoid_: login page, splash, auth screens (the sign-in service's own pages)

### PWA

#### Core

**Client**:
The app's side in one open page (a browser tab or an installed app's window): it registers the service worker and watches its Status.
_Avoid_: tab, page client

**Status**:
The Client's one view of its service worker: Unsupported, Installing, Ready, Update Ready or Updating. Read from the browser's own service worker events, never asked of the worker.
_Avoid_: update state, lifecycle state, worker state

**Strategy**:
How the service worker answers one kind of request, such as network-first or cache-first. A Strategy rule matches requests and names the Runtime Cache its responses go to.
_Avoid_: caching rule, handler, route

**Extras**:
Optional page features the PWA does not need to work: the Install Prompt, online state, display mode and storage persistence. Each stands alone, with no provider.
_Avoid_: utilities, helpers, add-ons

#### Offline

**App Shell**:
The minimum HTML, scripts, and styles an app needs to boot and render its routes without the network.
_Avoid_: shell page, skeleton, Frame (the layout every screen sits in)

**Precache**:
The set of build assets saved when a new version installs, so the App Shell opens with no network.
_Avoid_: preload, static cache

**Runtime Cache**:
Responses saved while the app runs, chosen per route or request kind, so recently seen screens keep working offline.
_Avoid_: dynamic cache, API cache

**Offline Fallback**:
The page shown for a navigation that has neither a network response nor a cached one.
_Avoid_: offline page, error page

#### Versions

**Update Prompt**:
The in-app message telling the user a new version is ready and offering to reload into it. The new version activates only when the app calls for it, normally when the user accepts.
_Avoid_: notification, update toast, reload banner

**Build ID**:
The identity of one build of the app. Every Client, the Precache, and the service worker each belong to exactly one Build ID.
_Avoid_: version number, hash, release

**Coordinated Reload**:
Accepting an update in any Client activates the new version and reloads every open Client into it, unconditionally, so all Clients always run one Build ID.
_Avoid_: refresh all, force reload

**Version Skew**:
A Client and the service worker it talks to belonging to different Build IDs. A transient fault, never a supported state.
_Avoid_: version mismatch, stale tab

**Command**:
The one frozen message a Client sends a service worker outside Worker RPC: asking the waiting version to activate. It must work across every version, since the waiting worker is newer than the Client.
_Avoid_: Control Channel, control RPC, lifecycle messages

**Install Prompt**:
The in-app invitation to add the app to the device's home screen or dock, using the browser's install flow where it exists and manual steps where it does not (iOS Safari). One of the Extras; the service worker itself installs silently.
_Avoid_: A2HS banner, install banner

#### Setup

**Preset**:
A named bundle of defaults for one kind of app, such as a content site or a signed-in dashboard. Chosen from evidence gathered in the playground, never by guess.
_Avoid_: template, profile, mode

**Kill Switch**:
A build that ships a service worker whose only job is to clear the toolkit's caches and unregister itself, the way out when a broken worker reaches users.
_Avoid_: disable flag, uninstall

#### Worker RPC

**Worker RPC**:
Effect RPC where the service worker serves requests and each open Client calls it. An optional capability, independent of caching and updates.
_Avoid_: SW RPC, message bus, bridge

**Worker Server**:
The Worker RPC server running inside the service worker. Holds no state that must outlive the worker being stopped.
_Avoid_: SW server, background server

**Worker Client**:
One Client's Worker RPC connection to the Worker Server.
_Avoid_: Tab Client, page client (the Service Worker API's own `Client` is the page itself, not this connection)

#### Messaging

**Notification**:
A system-level message shown by the operating system on the app's behalf. Never an in-app message.
_Avoid_: push (the delivery channel, not the message), toast, alert
