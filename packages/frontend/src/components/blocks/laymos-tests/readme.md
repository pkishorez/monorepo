# Laymos Tests

`LaymosTests` renders the completed `TestsReport` returned by the DevTools API.
Its sidebar follows the report's project, module, recursive suite, and Test Case
hierarchy. Selecting any level limits the right pane to that branch.
Clicking a node collapses unrelated branches and reveals only that node's
immediate children. Right-clicking a Module or Suite follows the File Tree
interaction: first reveal the node, then expand or collapse its full subtree.
The results pane preserves the same structure: File selections separate direct
tests from Suite groups, and Suite selections separate direct tests from nested
Suite groups instead of flattening every Case into one list.
File, Suite, and Test rows use distinct icons colored by outcome. Result Suite
groups are simple disclosures: top-level groups begin open, deeper groups begin
collapsed, and each group can be toggled directly.

The first Test Case in a selection is open by default, so selecting a Case in
the sidebar reveals its details immediately. With Multi-expand off, opening one
closes the previous Case; with it on, Cases open independently. Expand all
enables Multi-expand, while Collapse all clears the list and restores
single-open mode. A compact section summary shows totals, outcomes, and elapsed
time without duplicating individual errors above the list. Skipped Cases remain
visible but quiet and clearly state that Vitest did not execute them. Laymos
Tests show their named assertions in invocation order. Failed assertions start
expanded with their error and expected-versus-actual diff; successful
assertions start collapsed.

Ordinary successful or pending Cases without evidence are non-interactive rows.
Cases with errors remain expandable so their failure details are available.

Enriched suites can include optional Markdown documentation. It appears above
the selected suite's Cases in a collapsed disclosure, keeping longer behavioral
context available without making the default view noisy.

The sidebar first separates Laymos-authored Tests from ordinary Vitest Tests.
Assertion values use an automatic JSON, Markdown, source, or plain-text view.
Mismatched text and JSON render as one unified expected-versus-actual diff.
Unexpected setup, Effect, timeout, and trace failures remain separate technical
details instead of being duplicated as assertion failures.

Laymos-authored Cases may also carry Markdown documentation. It renders
directly inside the expanded Case, before its assertions. When a test captures
an Effect trace, each recorded trace appears below the assertions in the shared
trace Gantt and span-detail viewer.
