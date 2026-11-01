---
'@kestack/connect': patch
'@kestack/cli-platform': patch
---

A Session in a git Project starts on the branch you pick.

**New**

- If that branch is checked out somewhere, the Session runs there. If not, the Project's folder switches to it, or the Session gets a new Worktree on its own `ke-code/` branch, named after its first Title.
- The code Plugin lists a Project's branches and streams each step of a start.
- A start whose git step or Agent fails (`HarnessFailed`) keeps nothing: no Session, no messages, and no Worktree or branch made for it while that branch has no commits of its own.
- cli-platform: every Plugin gets a shared folder that outlives a Connection (`pluginShared`). New Worktrees live there.

**Known limits**

- A Project with no commits starts on its current branch and can't make a Worktree yet.
- If Connect stops between a new Session's first message and its save, that message is left without a Session.
