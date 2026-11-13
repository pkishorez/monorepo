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
The shared light or dark appearance of every app on the Web Platform. The preference is stored in a user-readable cookie shared by sibling application hosts; without that cookie, the Theme is dark.
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

**Install Prompt**:
The in-app invitation to add the app to the device's home screen or dock, using the browser's install flow where it exists and manual steps where it does not (iOS Safari). One of the Extras; the service worker itself installs silently.
_Avoid_: A2HS banner, install banner

#### Offline

**App Shell**:
Kabuki Start's App Shell, kept by the service worker for its Build ID: what every page is answered with, without the network, so the app boots at once and each page loads its own data. There is no other offline page.
_Avoid_: shell page, skeleton, offline page, Offline Fallback (the former page for a navigation with nothing cached), Frame (the layout every screen sits in)

**Precache**:
What a new version saves as it installs, so the app opens with no network: the build's assets and Kabuki Start's App Shell.
_Avoid_: preload, static cache

**Runtime Cache**:
Responses saved while the app runs, each kind of request by its Strategy, such as the images a screen showed. Never a page: every page is the App Shell.
_Avoid_: dynamic cache, API cache, page cache

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
The one message a Client sends a service worker: asking the waiting version to activate. It is frozen, since it must work across every version: the waiting worker is newer than the Client.
_Avoid_: Control Channel, lifecycle messages

#### Setup

**Preset**:
A named bundle of Strategy defaults for one kind of app, such as a content site or a signed-in tool. How a page works offline is never a Preset's: every page is the App Shell.
_Avoid_: template, profile, mode

**Kill Switch**:
A build that ships a service worker whose only job is to clear the PWA's caches and unregister itself, the way out when a broken worker reaches users.
_Avoid_: disable flag, uninstall

**Splash**:
The image iOS shows while an installed app starts, one for each screen size iOS knows. The app draws them; the PWA only lists them.
_Avoid_: launch screen, startup image, loading screen

### Shipping

**Stage**:
One place an app is deployed to, as alchemy names it: `prod`, `demo`, a pull request's `prN`, or anyone's own on their machine. Only `prod`, `demo` and `prN` reach the world, and only when the deploy says so on purpose; anyone's own is served on their machine and keeps its alchemy state there.
_Avoid_: environment, deployment, target

### Devtools

**Devtools Dock**:
Where devtools sit beside a page, opened from one button that never moves: full screen over the page, a bar under it or a panel on its right that push the page aside, or a floating window. Its layout and sizes are kept across reloads. What sits in it is not the Web Platform's: Kabuki's Inspector is @kestack/devtools-kabuki's.
_Avoid_: drawer, overlay, devtools panel
