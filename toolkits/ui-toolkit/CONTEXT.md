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

**Edge Ownership**:
Who handles a swipe that starts at a screen edge in the current Environment: the app, the browser, or the operating system. The app acts on an edge only when it owns it.
_Avoid_: gesture conflict, edge zone

**Gesture Zone**:
An element region where the app owns touch input: its bounds minus the viewport's edge strips, whose Edge Ownership lies elsewhere or is reserved for edge gestures. Vertical scrolling stays native inside it until a touch is Captured, and a touch that starts in a native scroller inside it belongs to that scroller. Zones nest: a touch belongs to the innermost zone it starts in, and a gesture that zone does not handle passes out to the zone around it.
_Avoid_: touch area, gesture surface, hit area

**Capture**:
The Gesture Zone taking a touch from the browser once the app owns it — a Pan or Swipe started, a second finger landed, or a Hold locked — so the page cannot scroll until every finger lifts. A touch the browser has already started scrolling can no longer be Captured.
_Avoid_: grab, prevent scroll

**Hold**:
The first finger down, staying still while the fingers that landed after it act in the Gesture Zone. It works like a held Shift key: every gesture of the other fingers happens with a left or right Hold, by where the held finger sits relative to them. Landing first and staying still make it; how long before the others it landed does not matter. It locks as another finger starts moving or taps, and its side is fixed then. The lock lasts until the held finger lifts, however far it wanders and however many gestures the others make. If the first finger moves, the fingers express a multi-finger gesture instead, not a Hold.
_Avoid_: anchor, chord, modifier, touch and hold (that is a long press)

**Tap**:
One or more fingers touching and lifting without meaningful movement. It fires as the fingers lift, never waiting for another Tap.
_Avoid_: click, press, double tap (not a gesture)

**Pan**:
Fingers moving freely across the Gesture Zone, followed continuously; on release whatever they moved may coast on with their speed.
_Avoid_: drag (moving an element itself), scroll

**Swipe**:
Fingers moving in one of four directions, followed continuously as progress toward a commit, however slowly. On release it commits if it went far enough or was flicked, and springs back otherwise.
_Avoid_: fling, flick (only the fast release that can commit a Swipe)

**Pinch**:
Two fingers moving apart or together to scale around the point between them.
_Avoid_: zoom (what an app may do with it), spread

**Claim**:
A Pan, Swipe or Pinch once classified. It stays that gesture until the last of its fingers lifts: one of them lifting and landing again rejoins it, up to the number it started with, and it releases only when none remain.
_Avoid_: lock, session

**Haptic**:
A short vibration confirming a Tap or a Hold locking, where the device can vibrate. Opt-in per app; silent everywhere it is not supported.
_Avoid_: vibration (the device capability), buzz, feedback

**Level**:
One step on the progressive ladder from plain web (0) through polished (1) and app-like (2) to native gestures (3). A pattern belongs to a Level and drops to the highest lower Level its Environment allows.
_Avoid_: tier, mode, enhancement flag

**Stack**:
The history-ordered pages of one navigation flow, where the few most recent previous pages stay mounted so going back is instant and exact.
_Avoid_: router outlet, page cache, keep-alive

**Continuity**:
Carrying the user's place — route, scroll positions, open panels — across a reload or relaunch so it feels like nothing happened.
_Avoid_: session restore, state persistence
