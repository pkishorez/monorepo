# @kestack/cli-platform

## 0.0.6

### Patch Changes

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`a581f08`](https://github.com/pkishorez/monorepo/commit/a581f085ade3a86e985d75b5ec9ba0724bc14ff0) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Runs on Kabuki's new Runtime and declared `provides`.

  **Added**

  - `Replicas.capabilities`, from `@kestack/std-toolkit`, and `CurrentAccount.capabilities`, from `@kestack/web-platform`: every Capability their Layer builds, to name in a page's `provides`: `provides: { capabilities: Replicas.capabilities, layer: () => Replicas.layer }`.

- Updated dependencies [[`df76ba6`](https://github.com/pkishorez/monorepo/commit/df76ba60280fdb5405ca85b29fe67f8604de18bf), [`af1f892`](https://github.com/pkishorez/monorepo/commit/af1f8924c111d3cdc6fa040ecc2982b3836f5fb9), [`4d4cc1a`](https://github.com/pkishorez/monorepo/commit/4d4cc1a3789e5f5feaf0892b246f04c7caffb983), [`a581f08`](https://github.com/pkishorez/monorepo/commit/a581f085ade3a86e985d75b5ec9ba0724bc14ff0), [`b72f4e7`](https://github.com/pkishorez/monorepo/commit/b72f4e76332cae07b51d0fbe128fff4b06f6f8a6), [`6f65d9b`](https://github.com/pkishorez/monorepo/commit/6f65d9b14a24b5c8728cdf628df1744cfc31857b), [`7cacf4f`](https://github.com/pkishorez/monorepo/commit/7cacf4f346b81da1732fac049ea01c3fcab9af0c), [`4dbf438`](https://github.com/pkishorez/monorepo/commit/4dbf43853ebb2eb47879a8bf73139ccf71ac3909), [`3bd9576`](https://github.com/pkishorez/monorepo/commit/3bd9576b80e3364b23826a4e070f81daec56f3c6), [`2678376`](https://github.com/pkishorez/monorepo/commit/2678376efd3ce396d3f491c63c615169112eccd9), [`6cf1d7f`](https://github.com/pkishorez/monorepo/commit/6cf1d7fb87f1b98311e1d6ab9b86b8f233e0c707), [`a581f08`](https://github.com/pkishorez/monorepo/commit/a581f085ade3a86e985d75b5ec9ba0724bc14ff0)]:
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
