---
status: accepted
---

# Keep Module Laymos surfaces intact during ejection

Each folder Module owns one optional flat `laymos/` surface containing
`*.story.ts`, `*.test.ts`, and support files, replacing the separate `stories/`
surface. The suffix distinguishes Stories from Tests while the shared directory
provides one place to understand a Module's Laymos material.

`laymos eject` atomically removes Story instrumentation from production code
and never changes or deletes a Laymos surface. Retained Stories can still
execute their Scenarios but lose Block-based structural narration; retained
Tests continue to run. Removing Laymos surfaces is an explicit manual action,
not another ejection command. This supersedes the surface-deletion boundary in
ADR-0009 and ADR-0014.
