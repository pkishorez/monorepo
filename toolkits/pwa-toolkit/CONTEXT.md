# PWA Toolkit

Companion toolkit that turns a TanStack Start app in this monorepo into an installable, offline-capable progressive web app.

## Language

### Offline

**App Shell**:
The minimum HTML, scripts, and styles an app needs to boot and render its routes without the network.
_Avoid_: shell page, skeleton

**Precache**:
The set of build assets saved when a new version installs, so the App Shell opens with no network.
_Avoid_: preload, static cache

**Runtime Cache**:
Responses saved while the app runs, chosen per route or request kind, so recently seen screens keep working offline.
_Avoid_: dynamic cache, API cache

**Offline Fallback**:
The page shown for a navigation that has neither a network response nor a cached one.
_Avoid_: offline page, error page

### Versions

**Update Prompt**:
The in-app message telling the user a new version is ready and offering to reload into it. The new version activates only when the user accepts, unless the app opts into applying updates on navigation.
_Avoid_: notification, update toast, reload banner

**Build ID**:
The identity of one build of the app. Every tab, the Precache, and the service worker each belong to exactly one Build ID.
_Avoid_: version number, hash, release

**Coordinated Reload**:
Accepting an update in any tab activates the new version and reloads every open tab into it, unconditionally, so all tabs always run one Build ID.
_Avoid_: refresh all, force reload

**Version Skew**:
A tab and the service worker it talks to belonging to different Build IDs. A transient fault, never a supported state.
_Avoid_: version mismatch, stale tab

**Control Channel**:
The toolkit's own frozen message protocol between tabs and service workers of any version, used for lifecycle traffic such as asking a waiting version to activate.
_Avoid_: control RPC, lifecycle messages

**Install Prompt**:
The in-app invitation to add the app to the device, using the browser's install flow where it exists and manual steps where it does not (iOS Safari).
_Avoid_: A2HS banner, install banner

### Setup

**Preset**:
A named bundle of defaults for one kind of app, such as a content site or a signed-in dashboard. Chosen from evidence gathered in the playground, never by guess.
_Avoid_: template, profile, mode

**Kill Switch**:
A build that ships a service worker whose only job is to clear the toolkit's caches and unregister itself, the way out when a broken worker reaches users.
_Avoid_: disable flag, uninstall

### Worker RPC

**Worker RPC**:
Effect RPC where the service worker serves requests and each open tab calls it. An optional capability, independent of caching and updates.
_Avoid_: SW RPC, message bus, bridge

**Worker Server**:
The Worker RPC server running inside the service worker. Holds no state that must outlive the worker being stopped.
_Avoid_: SW server, background server

**Tab Client**:
One tab's Worker RPC connection to the Worker Server.
_Avoid_: page client, window client (the Service Worker API's own `Client` is the tab itself, not this connection)

### Messaging

**Notification**:
A system-level message shown by the operating system on the app's behalf. Never an in-app message.
_Avoid_: push (the delivery channel, not the message), toast, alert
