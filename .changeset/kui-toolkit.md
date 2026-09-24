---
'kui-toolkit': patch
---

Add the Monoverse block: the complete explorer UI and data types for a bird's-eye view of a pnpm monorepo, with Packages laid out by dependency rank, filterable runtime, dev, peer, and optional connections, dependency cycles, and drill-down into Laymos. It marks new and modified Packages against a Base ref on the canvas and in the Package tree, and a Package's source dialog shows its README beside its files with a diff for every changed file. Package cards no longer show their Package group label.

Add the `git-changes` and `source-explorer` blocks, shared by Laymos and Monoverse: one git menu, one set of change markers, and one source dialog. The Laymos Files tab also lists Unanalyzed files, shown muted.

Add the `auth` block that the auth-toolkit pages are built on, with one width, one loader, and no layout shifts.

Add adaptive compact layouts for the Lotel and Laymos workspaces, with a bottom tool bar, drill-down pages, and sheet-based controls below 768px.

Show unchanged modules by default, hide module connections initially, and use compact lowercase monospace navigation controls across the Laymos and Monoverse workspaces.

Style document scrollbars with a thin, theme-aware thumb and avoid reserving scrollbar space when it is not needed.

Breaking: `DevToolsPanel` requires `runtime`, the swim-lane input changes from the old recorded-flow shape to a `@pkishorez/flow` Projection, and `onActivityClick` is removed.
