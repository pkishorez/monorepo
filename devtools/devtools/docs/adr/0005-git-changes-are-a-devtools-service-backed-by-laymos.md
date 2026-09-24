# Git changes are a DevTools service backed by the laymos package

Laymos and Monoverse both show a Change set measured against one Base ref, so
the DevTools RPC exposes branches, Change sets, and file diffs as Tool-neutral
calls that take a folder (`GetBranches`, `GetChanges`, `GetFileDiff`) rather
than as Laymos calls that require a `laymos.config.json`. The git work itself
stays in the laymos package, which exports folder-based loaders for it, because
Monoverse already borrows Base ref and Change set "with the same meaning as in
Laymos" and one implementation keeps that meaning from drifting.

We considered parallel Monoverse git calls, which would duplicate the git
parsing and let the two Tools disagree on what a Change set is, and extracting
git and the Change set schema into their own package, which is the cleaner
boundary but a whole package for three loaders. If a third consumer outside
DevTools needs git changes, that extraction is the next step; until then,
Monoverse reaching git through the laymos package is deliberate, not a leak.
