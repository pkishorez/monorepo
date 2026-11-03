---
'@kestack/connect': patch
---

A Project whose folder is inside a git repository, as a package of a monorepo, is a git Project.

**Changed**

- `branches` lists the repository's branches for a folder anywhere inside it, not only at its top, so the Branch Picker and New Worktree switch show for it.
- A Session in such a Project runs in the same folder of its Worktree: a new Worktree's `packages/one`, or that of the Worktree a branch is out in.
