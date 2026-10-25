# Web Platform

The way to build a kestack app on Kabuki Start, in one go: a PWA by default, with its Theme, and the look, input, components and Recipes to build its screens. Kabuki Start serves the app and knows nothing of these; the Web Platform is where they are decided.

## Language

### Accounts

**Account Switcher**:
In a Kabuki app, the Child of the root page that follows auth-toolkit's Accounts and times an Account Switch: it shows once under way 150 ms and stays at least 300 ms, the Account before shown until then. The root page draws it in the header: "Sign in", or the Active Account's menu to switch, add and sign out.
_Avoid_: switcher (alone: the Map's own), account menu (what it draws), account bar

**Current Account**:
What the root page of a Kabuki app Provides its pages, `CurrentAccount`: who is signed in and the Account a switch on screen makes active, as the Account Switcher's Model has them, and Requests to it to sign in, switch and sign out.
_Avoid_: session (auth-toolkit's Sign-in), user, viewer

### Theme and layout

**Theme**:
The shared light or dark appearance used by KUI-based applications. The preference is stored in a user-readable cookie shared by sibling application hosts; without that cookie, the Theme is dark.
_Avoid_: color mode, system theme

**Status Bar Surface**:
The opaque strip at the top edge of an app that nothing covers, in the Theme's background or in the color of whatever the app shows up there, such as a sidebar behind a page moved aside. An installed iOS web app colors its status bar from it rather than from the declared theme color, so it is what makes the status bar follow a Theme switch.
_Avoid_: header background, notch fill

**Frame**:
The layout every app screen sits in: the Status Bar Surface, the Sidebar, and the header with its title and actions. On a narrow screen the Sidebar shows in its Sidebar Mode; on a wide one it stays beside the page.
_Avoid_: app shell (the PWA's App Shell is what boots offline), layout, chrome

**Sidebar Mode**:
How the Frame's Sidebar shows on a narrow screen: Slide, beside the page as the page moves aside and dims, or Full Screen, a page of its own in the page's place. Either opens with a swipe right and closes with a swipe left.
_Avoid_: drawer, page (as a mode), phone layout

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
Kabuki Start's App Shell, kept by the service worker for its Build ID: what a client page is always answered with, and any other page offline when this build has no copy of it, so it boots and loads its own data with no network. There is no other offline page.
_Avoid_: shell page, skeleton, offline page, Offline Fallback (the former page for a navigation with nothing cached), Frame (the layout every screen sits in)

**Precache**:
What a new version saves as it installs, so the app opens with no network: the build's assets, and from Kabuki Start's Pages the App Shell and every static page that is one URL.
_Avoid_: preload, static cache

**Runtime Cache**:
Responses saved while the app runs, chosen per request kind, so recently seen screens keep working offline: among them the pages the Precache does not hold, kept for their Build ID as each is visited.
_Avoid_: dynamic cache, API cache

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
A named bundle of defaults for one kind of app, such as a content site or a signed-in dashboard. Chosen from evidence gathered in the playground, never by guess. How a page works offline is never a Preset's: its Render Mode decides.
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

### Shipping

**Stage**:
One place an app is deployed to, as alchemy names it: `prod`, `demo`, a pull request's `prN`, or anyone's own on their machine. Only `prod`, `demo` and `prN` reach the world, and only when the deploy says so on purpose; anyone's own is served on their machine and keeps its alchemy state there.
_Avoid_: environment, deployment, target

### Kabuki Inspector

How the Inspector (see @kestack/kabuki's glossary) draws the Snapshot. Drawing words only: an Actor, an Instance, a State and a Worker keep their @kestack/kabuki names.

**Devtools**:
The Inspector on a running app, from its runtime: its Timeline is the app's History, a Step picked there Time Travels the app itself, and live, its Worker Rows say what each Worker is doing.
_Avoid_: debugger, panel

**Devtools Dock**:
Where Devtools sit beside a page, opened from one button that never moves: full screen over the page, a bar under it or a panel on its right that push the page aside, or a floating window. Its Layout and sizes are kept across reloads.
_Avoid_: drawer, overlay, devtools panel

**Map**:
The Inspector's drawing of one Snapshot: a tree of Nodes and State Nodes joined by Links, as a packed tree top-down or as an outline, the root at its top. Every Node's size comes from its Actor alone; what hangs below one comes from the State it is in, so the Map moves at a Transition and at a Fold, and only then: what stops shrinks into what it hung from, what starts grows out of it, and the rest glides to its new place.
_Avoid_: graph, canvas, diagram

**Node**:
One place an Actor runs, drawn as a card: the Actor's name, its States as options with the one its Instance is in filled, and its Worker Rows. Raised with a shadow while an Instance runs there, flat, dashed and dim while one only could. A slot of keyed Children is one place, drawn as a stack of cards showing one of its Instances at a time, picked with its Switcher: its States count every Instance and fill the shown one's, its Worker Rows and everything below it are the shown one's.
_Avoid_: box, vertex

**Switcher**:
The arrows in a place of many's header that step through its Instances, with the shown one's key and where it is among them. Unless one is picked, it shows the one the Step's Message passed through, or the first.
_Avoid_: pager, carousel, tabs

**State Node**:
A small node under a Node for each of its States that starts something. The one its Instance is in is lit, and what that State starts hangs from it; any other is faded and names what it would start beneath itself. What runs in every State hangs from the Node itself.
_Avoid_: via, edge label, branch

**Worker Row**:
One line on a Node for each Worker its Actor has, there at every Step: the Worker's name, where it is written, and one dot per key it runs now. Live, a dot breathes while its key works, is red where it failed, and quiet where it finished; at a past Step a dot says only that its key is on. A Worker with no key running reads off.
_Avoid_: pulse, badge, worker node, indicator

**Link**:
The curve from a Node to a State Node or a Node below it.
_Avoid_: edge, wire, connection

**Fold**:
What a right click on a Node does: what hangs below it is hidden, named in one row under it, and a click on the names, or another right click, brings it back. A Message into a folded subtree is shown on the folded Node. A Node with nothing below it shakes instead.
_Avoid_: collapse, hide, minimise

**Popup**:
What picking a place of keyed Children opens beside it, over the Map: its Instances, by key, with the State each is in, each to pick. Picking one shows it, as the Switcher does.
_Avoid_: tooltip, menu, expansion

**Focus**:
What picking a Node does to the Map: the Node, the way up from it to the root, and what hangs right below it stay bright, and everything else all but fades away. A tap on the empty Map lets go.
_Avoid_: highlight, selection, dim mode

**Beat**:
How a Step's Message is shown on the Map: an arrow from exactly what Sent it, the Worker Row or the Sender's name, into the Node it went to, which glows; the Message's tag on that Node's top edge, with who Sent it; and the Commands its Update asked for on its bottom edge. It rides along when the Map moves.
_Avoid_: animation, frame, tick

**Sheet**:
The data of what is picked, along the bottom of the Inspector: an Instance, a place of many, a State, a Worker, or the Step's Message. On a wide Inspector it is a section of its own under the Map, what is picked on its left and each value in a column beside it; on a narrow one, a drawer over the Map, the full width, everything stacked.
_Avoid_: panel, drawer (on its own), details, modal
