# Layers form one default-deny dependency DAG

Laymos treats Layers as a partition of the supported files beneath Source
roots after explicit ignored paths are removed: every included file belongs to
exactly one Layer, and declared Layer scopes may never overlap. LayerGraphs are
labels for organizing Rules, not separate enforcement boundaries; all Rules
are unioned into one transitive, default-deny dependency graph, and config
validation rejects unknown Layer references or any cycle in that union. This
avoids unassigned files becoming silent architecture escape hatches and keeps
“above” and “below” meaningful across every grouping.

Layer lint checks concrete direct file imports against reachability in that
union. It reports unassigned files and direct forbidden imports, but not the
transitive consequences of a forbidden import, because only the direct edge is
actionable. Independent LayerGraph enforcement, partial Layer coverage, and
cyclic permissions were rejected because they would respectively give
grouping semantic weight, leave unenforced files, or collapse the hierarchy.
