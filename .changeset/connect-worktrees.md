---
'@kestack/connect': patch
'@kestack/cli-platform': patch
---

A Session in a git Project starts on the branch picked: where that branch is out, in the Project's folder switched to it, or in a new Worktree on its own `ke-code/` branch, named for its first Title. The code Plugin lists a Project's branches, streams each step of a start, and refuses one whose git step fails. A Session keeps the branch its Worktree is on. cli-platform gives every Plugin a shared folder that outlives any one Connection, where new Worktrees are kept.
