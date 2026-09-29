# Frontend — Ubiquitous Language

Reusable user-interface blocks and presentation components shared by applications in the monorepo.

## Language

**Theme**:
The shared light or dark appearance used by KUI-based applications. The preference is stored in a user-readable cookie shared by sibling application hosts; without that cookie, the Theme is dark.
_Avoid_: color mode, system theme

**Studio block**:
A minimal, read-only inspector for one remotely hosted StdTable, driven by a live Studio RPC client. Its Diagram and Query views remain unavailable until the table snapshot has loaded.
_Avoid_: Database admin, table editor, data grid.

**Diagram view**:
The Studio view that presents the table snapshot as an Entity Relationship view.
_Avoid_: Table topology graph, schema dependency graph.

**Query view**:
The Studio view for selecting one Entity and reading its records through the operations exposed by Studio RPC. A single Entity is retrieved directly; a keyed Entity is queried through one of its access patterns.
_Avoid_: Table scan, raw index browser.

**Query criteria**:
The access pattern, exact partition-key components, sort-key condition, and sort-key components that identify one Studio RPC query. They describe an access pattern query, not arbitrary record filtering.
_Avoid_: Filters, index query, column conditions.

**Record details**:
The complete encoded Entity, including metadata, presented as read-only structured JSON in a dialog after selecting its row in the Query view.
_Avoid_: Record editor, decoded Entity.

**Record table**:
The paginated presentation of a Query view result page. Each top-level encoded value field is one column; nested values remain compact previews, while one Meta column surfaces schema version and deletion state.
_Avoid_: Spreadsheet, flattened JSON, editable grid.

### Native block

**Native block**:
The kui block that makes a TanStack Start app feel like an installed mobile app — stacked pages, gesture navigation, and state that survives reloads — while degrading to ordinary web behaviour wherever the platform owns the interaction.
_Avoid_: native toolkit, app shell (a pwa-toolkit term for the offline boot page), mobile mode

**Environment**:
What the running app can know about where it runs: platform, display mode (browser tab or installed), primary input, reduced-motion preference, and which browser capabilities exist. Every Native block decision is derived from it.
_Avoid_: device, context, user agent

**Gesture Zone**:
The one region per screen where the app owns touch input for app-level shortcuts — opening a sidebar, pulling to refresh, going back, steering something elsewhere on screen. Where the app places it and how large it makes it is the app's choice. Its Gestures are not tied to any element under the finger: any part of the app, even one hidden right now, can listen to them. Gestures that belong to one element, such as swiping one email, are that element's own and not the zone's.
_Avoid_: touch area, gesture surface, hit area, nested zone, provider (only how the zone is reached)

**Native Scroll**:
An element inside the Gesture Zone that can scroll right now, whose scrolling the browser keeps. The choice is made at a touch's first movement: when it is one finger with no Hold and an element under it can still scroll that way, the browser keeps the touch until every finger lifts, even when it reaches the end, and the Gesture it started ends as interrupted. At its end that way, under a Hold, or with two fingers down before the first movement, the zone captures the touch instead. An element where the zone is turned on always gives its scrolling up to the zone.
_Avoid_: scroller, scroll container, overflow

**Capture**:
The Gesture Zone taking a touch from the browser at its first movement, so nothing scrolls or zooms until every finger lifts. By default the zone captures every touch except one a Native Scroll keeps. Any element inside can turn the zone off for itself and what it holds — the zone then never takes a touch there — or turn it back on, which captures every touch there even over a Native Scroll. The nearest such element decides.
_Avoid_: grab, prevent scroll, dead zone

**Gesture**:
One continuous touch in the Gesture Zone, from the first finger landing to the last one lifting. Fingers may join and leave freely without ending it or turning it into something else. It is never classified up front: it reports movement, scale and rotation relative to where it started, and their speeds, all at once. One finger only moves it; two fingers can also scale and rotate it. Listeners read the parts they want.
_Avoid_: pan, pinch, drag (moving an element itself), shortcut (a Gesture an app binds to a command), interaction

**Hold**:
A mode, like a held Shift key, that puts every Gesture the other fingers make under the Hold, giving an app a further set of shortcuts. It starts from a finger in the Hold Zone, and only on a screen where something takes Gestures under the Hold. Where nothing on the screen expects a pinch, it starts the moment another finger lands; where something does, the finger must first press still for a moment, so that fingers landing together stay a pinch, and the Hold then ticks. Until it starts, the corner finger is ordinary: lifting quickly, it is a Tap; moving, a Gesture. Pressed longer and lifted alone, it is nothing at all, and nothing is clicked. The Hold finger is never part of a Gesture itself. The Hold stays in effect until no finger is left on the zone: lifting the Hold finger during a Gesture does not end it. A listener takes Gestures either under the Hold or with none.
_Avoid_: anchor, chord, touch and hold (that is a long press), modifier key, left or right Hold (there is one Hold)

**Hold Zone**:
A quarter circle on the bottom-left corner of the Gesture Zone where a finger can start the Hold. It is live only while something on the screen takes Gestures under the Hold; otherwise it is ordinary screen. While the Hold is on, the Hold Zone glows.
_Avoid_: hotspot, modifier key

**Pan**:
A one-finger Gesture read as how far the finger has moved, with no scale or rotation. A second finger landing, or the browser taking the touch, ends it as interrupted. A screen whose Gestures are all one finger can start the Hold at once.
_Avoid_: drag (moving an element itself), scroll

**Tap**:
One finger touching and lifting without meaningful movement, with no other finger down except a Hold. It fires as the finger lifts, never waiting for another Tap. It is also a Gesture that did not move. With no Hold, the element under it is still clicked as usual; under a Hold it is a shortcut only, and nothing is clicked. Two fingers are never a Tap.
_Avoid_: click, press, double tap and two-finger tap (not Gestures)

**Swipe**:
A one-finger Gesture read along one axis — horizontal or vertical, fixed by its first real movement — as the signed distance moved from where it started and the speed it is moving at. It judges nothing: completing, snapping, opening and refreshing are decisions of what is built on top of it, such as a sidebar or pull-to-refresh. Two fingers are never a Swipe: a second finger landing, or the browser taking the touch, ends it as interrupted, and no new Swipe starts until every finger has lifted.
_Avoid_: fling, flick, drag, commit (a decision made on top of a Swipe)

**Active**:
A Gesture or Swipe listener while a Gesture it reads is under way; it stops being Active when the last finger lifts. A listener that is not enabled is never Active.
_Avoid_: dragging, pressed, engaged

**Level**:
One step on the progressive ladder from plain web (0) through polished (1) and app-like (2) to native gestures (3). A pattern belongs to a Level and drops to the highest lower Level its Environment allows.
_Avoid_: tier, mode, enhancement flag

**Stack**:
The history-ordered pages of one navigation flow, where the few most recent previous pages stay mounted so going back is instant and exact.
_Avoid_: router outlet, page cache, keep-alive

**Continuity**:
Carrying the user's place — route, scroll positions, open panels — across a reload or relaunch so it feels like nothing happened.
_Avoid_: session restore, state persistence
