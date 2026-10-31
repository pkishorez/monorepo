# @kestack/cli-platform

## 0.0.5

### Patch Changes

- [#104](https://github.com/pkishorez/monorepo/pull/104) [`b8eac00`](https://github.com/pkishorez/monorepo/commit/b8eac00499dc3920c3cce10db1187537d459b45b) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Session in a git Project starts on the branch picked: where that branch is out, in the Project's folder switched to it, or in a new Worktree on its own `ke-code/` branch, named for its first Title. The code Plugin lists a Project's branches, streams each step of a start, and refuses one whose git step fails, or whose Agent fails to open (HarnessFailed): either way no Session is kept, nor its messages, nor a Worktree or branch made for it while that branch is out nowhere and has no commits of its own; a folder switched for it stays on the branch picked. Known gap: Connect stopping between a new Session's first message and its save leaves that message's records with no Session. A Project with no commits starts on the branch it is on; a new Worktree there is refused until it has one. Only a branch the Project lists reaches git. A Session keeps the branch its Worktree is on. cli-platform gives every Plugin a shared folder that outlives any one Connection, where new Worktrees are kept; a Plugin started by an older CLI finds it itself (`pluginShared`).
- Updated dependencies [[`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed), [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497)]:
  - @kestack/kabuki@0.0.5
  - @kestack/std-toolkit@0.0.6
