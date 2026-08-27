# Frontend — Ubiquitous Language

Reusable user-interface blocks and presentation components shared by applications in the monorepo.

## Language

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
