# @kestack/connect

## 0.0.4

### Patch Changes

- [#92](https://github.com/pkishorez/monorepo/pull/92) [`3bfd2c8`](https://github.com/pkishorez/monorepo/commit/3bfd2c82dfb21a7819b1c724cd1a32fb55092003) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A Machine runs the agents installed on it, and keeps Harness Accounts: each agent's Default Account, and any other login the user adds, such as a second Claude for work.

  - Breaking: `harnessBinaries` and `setHarnessBinary` are `harnessAccounts`, `saveHarnessAccount` and `removeHarnessAccount`; an account has a name, a binary and a config folder.
  - Breaking: `harnesses` lists one entry per Harness Account: its `account` id, its `harness` (was `name`) and the account's `name` (was `label`); `startSession`, `models` and `skills` take `account` instead of `harness`, and `UnknownHarness` is `UnknownAccount`.
  - A Session runs, forks and is asked as the account it started with; Sessions stored before run as their harness's Default Account, and a Harness Binary set before is that account's.
  - A first `npx @kestack/connect` downloads about 650 MB less: no bundled Claude Code, Codex or speech runtime.

- [#91](https://github.com/pkishorez/monorepo/pull/91) [`2642a80`](https://github.com/pkishorez/monorepo/commit/2642a80efb0ca75b2f2698f739914525de95f98e) Thanks [@kishorenuma](https://github.com/kishorenuma)! - `pnpm dev` signs in with auth-toolkit's Fake everywhere, through the `kestack-fake-auth` export condition, and serves every backend on the site's own origin at `/rpc-<name>`, so one tunnel reaches the whole app; `pnpm dev:real` keeps the Auth Worker. A Fake Account's email must be at `kestack.test`, and `fakeGuard` makes the User from it again. The Web Platform fails any build that carries the Fake, and its `backend` gives a Worker's build the same switch.
- Updated dependencies [[`3bfd2c8`](https://github.com/pkishorez/monorepo/commit/3bfd2c82dfb21a7819b1c724cd1a32fb55092003), [`2642a80`](https://github.com/pkishorez/monorepo/commit/2642a80efb0ca75b2f2698f739914525de95f98e)]:
  - @kestack/ai-toolkit@0.0.4
  - @kestack/auth-toolkit@0.0.4
  - @kestack/rpc-toolkit@0.0.4
  - @kestack/std-toolkit@0.0.4
  - @kestack/kabuki@0.0.3

## 0.0.3

### Patch Changes

- [#88](https://github.com/pkishorez/monorepo/pull/88) [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1) Thanks [@kishorenuma](https://github.com/kishorenuma)! - New package: Connect, the program on a computer that serves Code, and Cloud Connect, which lists a User's Machines.

  - `ke-connect serve` and `ke-connect logout` run and forget the Machine; its files live in XDG folders, moved once from `~/.ai-toolkit`.
  - Doors: `machine`, `code` (what Code's browser imports, over the `ke-connect` subprotocol), `worker` (Cloud Connect) and `dev`.
  - `dev` runs one Connect per branch, shared by every App's `pnpm dev`, and stops once the last App lets go.

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - @kestack/ai-toolkit@0.0.3
  - @kestack/auth-toolkit@0.0.3
  - @kestack/kabuki@0.0.3
  - @kestack/rpc-toolkit@0.0.3
  - @kestack/std-toolkit@0.0.3
