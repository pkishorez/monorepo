---
status: accepted
---

# Keep Story control flow expression-shaped

Story intent and execution stay in one expression. An assigned Decision derives
one value and rejoins its containing Flow; a returned Decision delegates the
remaining execution to its Arms; a discarded Decision is invalid. Native
branching directly inside narrated Flow and Arm bodies is discouraged because
Trace Mode cannot observe it, while lint rejects only clear local misuse.
Public Effect-returning service methods use Flow-valued class fields, and
ejection preserves those fields and substitutes Decisions directly with Effect
Match.

Assigned Decisions render as one node with expandable Arms and one outgoing
path. Returned Decisions render their Arms as control-flow branches. Arm
metadata may document either exhaustive possible errors or one exact terminal
completion, and Scenarios validate the observed outcome.
