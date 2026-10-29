---
'@kestack/connect': patch
'@kestack/cli-platform': patch
---

A Session in a git Project starts on the branch picked: where that branch is out, in the Project's folder switched to it, or in a new Worktree on its own `ke-code/` branch, named for its first Title. The code Plugin lists a Project's branches, streams each step of a start, and refuses one whose git step fails, or whose Agent fails to open (HarnessFailed): either way no Session is kept, nor its messages, nor a Worktree or branch made for it, and a folder switched for it switches back unless it has changes. A Project with no commits starts on the branch it is on; a new Worktree there is refused until it has one. Only a branch the Project lists reaches git. A Session keeps the branch its Worktree is on. cli-platform gives every Plugin a shared folder that outlives any one Connection, where new Worktrees are kept; a Plugin started by an older CLI finds it itself (`pluginShared`).
