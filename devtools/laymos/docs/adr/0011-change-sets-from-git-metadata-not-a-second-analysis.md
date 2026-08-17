# Change sets come from git metadata, not a second Architecture Analysis

A reader reviewing work in progress wants to know which Modules and Stories a
change touched, not only what the Project looks like right now. The obvious way
to answer that is to run `analyzeProject` twice — once against the working tree
and once against a materialized Base ref — and diff the two analyses. We
rejected it. A Change set is instead derived entirely from git path metadata:
`git status --porcelain` for the working tree and `git diff --name-status`
against the merge-base, mapped onto the Module membership and Story source
paths the current analysis already carries.

Diffing two analyses would mean materializing the Base ref as a worktree, which
has no installed dependencies and therefore resolves imports differently, and
paying a second full cruise on every refresh. The git-only route needs no
worktree, no second cruise, and no new dependency, and it answers the question
that was actually asked: which Modules and Stories were added or modified. It
also keeps `analyzeProject` free of git, preserving the rule that Git state has
no bearing on membership — a Change set decorates an analysis and never feeds
one.

## Consequences

Violation and dependency-edge deltas are out of reach. "This branch introduced
two Layer violations" needs a base analysis, so it stays unanswerable until we
choose to pay for one; the Change set shape is additive and would not have to
change to gain it.

Deletions and renames are excluded on purpose. Naming a removed Module requires
the Base ref's Config, and recovering the Stories a deleted file held requires
loading the Base ref's Story tree — both reintroduce the base-materialization
cost for the least valuable part of the view. Renames are read as additions. A
Module whose only change is a deleted file therefore reads as unchanged.

Resolution is per file. Stories sharing one file share one status, and editing
a Support file marks every Story in its group modified.
