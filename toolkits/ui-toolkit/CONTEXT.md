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

**Level**:
One step on the progressive ladder from plain web (0) through polished (1) and app-like (2) to native gestures (3). A pattern belongs to a Level and drops to the highest lower Level its Environment allows. Gestures themselves — zones, Recognizers and touch Patterns — are use-gesture's language (`packages/use-gesture/CONTEXT.md`); a Native block pattern is one of those Patterns plus its Level.
_Avoid_: tier, mode, enhancement flag

**Stack**:
The history-ordered pages of one navigation flow, where the few most recent previous pages stay mounted so going back is instant and exact.
_Avoid_: router outlet, page cache, keep-alive

**Continuity**:
Carrying the user's place — route, scroll positions, open panels — across a reload or relaunch so it feels like nothing happened.
_Avoid_: session restore, state persistence
