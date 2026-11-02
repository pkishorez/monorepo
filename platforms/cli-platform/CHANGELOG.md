# @kestack/cli-platform

## 0.0.6

### Patch Changes

- Updated dependencies [[`df76ba6`](https://github.com/pkishorez/monorepo/commit/df76ba60280fdb5405ca85b29fe67f8604de18bf)]:
  - @kestack/kabuki@0.0.6
  - @kestack/std-toolkit@0.0.7

## 0.0.5

### Patch Changes

- [#104](https://github.com/pkishorez/monorepo/pull/104) [`b8eac00`](https://github.com/pkishorez/monorepo/commit/b8eac00499dc3920c3cce10db1187537d459b45b) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Session in a git Project starts on the branch you pick.

  **New**

  - If that branch is checked out somewhere, the Session runs there. If not, the Project's folder switches to it, or the Session gets a new Worktree on its own `ke-code/` branch, named after its first Title.
  - The code Plugin lists a Project's branches and streams each step of a start.
  - A start whose git step or Agent fails (`HarnessFailed`) keeps nothing: no Session, no messages, and no Worktree or branch made for it while that branch has no commits of its own.
  - cli-platform: every Plugin gets a shared folder that outlives a Connection (`pluginShared`). New Worktrees live there.

  **Known limits**

  - A Project with no commits starts on its current branch and can't make a Worktree yet.
  - If Connect stops between a new Session's first message and its save, that message is left without a Session.

- Updated dependencies [[`85d0632`](https://github.com/pkishorez/monorepo/commit/85d063272beee88e041d0fb0734af2e0a0ceeb68), [`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed), [`daadcde`](https://github.com/pkishorez/monorepo/commit/daadcdebc5f79a7a8b92b4edbb31a6083ff3414a), [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497)]:
  - @kestack/kabuki@0.0.5
  - @kestack/std-toolkit@0.0.6
