---
status: accepted
---

# Build Story structure with Trace Mode

The unified Story is produced by a dedicated, side-effect-free Trace Mode rather
than by merging Scenario observations. Trace Mode traverses Flows, records but
does not execute thunked Steps, explores every lazily registered Decision Arm,
and retains explicit structure for omissions, collections, repetition, and
shared or recursive Flows; unknown runtime values travel only as internal proxy
values.

Reading Stories generates their traces without running Scenarios. Scenario runs
remain real runtime evidence and require valid traces first. Projection checks
are deferred until raw JavaScript conditionals can be analyzed reliably. This
accepts a stricter, breaking authoring model in exchange for a structural
narrative that does not depend on which Scenarios happen to exist.

This supersedes ADR-0003 and ADR-0005.
