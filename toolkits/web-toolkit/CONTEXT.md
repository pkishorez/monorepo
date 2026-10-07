# Web Toolkit

The one Toolkit for web apps: their look, input, components, Recipes, the optional PWA, and the opinionated way in on TanStack Start.

## Language

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
Something the root document takes in without knowing it: head tags for every page, and a provider around every page. The PWA plugs in this way, so an app that leaves it out ships none of it.
_Avoid_: extension, middleware, addon

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
