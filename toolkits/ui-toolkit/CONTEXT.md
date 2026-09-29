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

**Gesture Provider**:
The one place that follows every finger for the Gesture Zones inside it and runs the one Gesture under way. An app usually has one at its root; separate sections may each have their own, each with its own Gesture.
_Avoid_: router, tracker, root zone

**Gesture Zone**:
An area where the app, not the browser, owns touch, for gestures such as opening a sidebar, pulling to refresh, swiping a row or pinching a card. Zones nest and sit side by side. A Gesture that starts in a zone is heard by it and by each zone around it, up to the first Trapped one; sibling zones never hear each other. Any part of the app inside a zone, even one hidden right now, can listen to what it hears.
_Avoid_: touch area, gesture surface, hit area, provider (that is the Gesture Provider)

**Trapped**:
A Gesture Zone whose Gestures go no further: the zones around it do not hear what starts inside it. A zone is not Trapped unless the app says so, and it may be Trapped only for a while, such as while its own options are open.
_Avoid_: isolated, captured, exclusive

**Native Scroll**:
An element inside a Gesture Zone that can scroll right now, whose scrolling the browser keeps. The choice is made at a touch's first movement: when it is one finger and an element under it can still scroll that way, the browser keeps the touch until every finger lifts, even when it reaches the end, and the Gesture it started ends as interrupted. At its end that way, or with two fingers down before the first movement, the zone captures the touch instead. Only elements between the finger and the innermost zone around it count. An element where the zone is turned on always gives its scrolling up to the zone.
_Avoid_: scroller, scroll container, overflow

**Capture**:
A Gesture Zone taking a touch from the browser at its first movement, so nothing scrolls or zooms until every finger lifts. By default the zone captures every touch except one a Native Scroll keeps. Any element inside can turn the zone off for itself and what it holds — the zone then never takes a touch there — or turn it back on, which captures every touch there even over a Native Scroll. The nearest such element decides.
_Avoid_: grab, prevent scroll, dead zone

**Gesture**:
One continuous touch, from the first finger landing in a Gesture Zone to the last one lifting. Every finger that lands in between, wherever it lands, is one of its Pointers; a Gesture Provider runs one Gesture at a time. It is never classified: it reports only its Pointers, and what it means — a pan, a pinch, a two-finger swipe, one finger holding while another moves — is decided by the app that reads it. Whether its release also clicks what is under it is the browser's call, unless the app prevents its click.
_Avoid_: pan, pinch, swipe, tap, hold (meanings an app reads from a Gesture), drag (moving an element itself), shortcut (a Gesture an app binds to a command), interaction

**Pointer**:
One finger of a Gesture: where, when and on what element it landed, counted from the Gesture's start, where it is now and how far it has moved, and where and when it lifted. A lifted Pointer stays part of the Gesture until the Gesture ends.
_Avoid_: touch, finger (outside plain speech), contact

**Active**:
A Gesture listener while a Gesture it reads is under way; it stops being Active when the last finger lifts. A listener that is not enabled is never Active.
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
