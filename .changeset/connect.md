---
'@kestack/connect': patch
---

A Machine runs the agents installed on it, and keeps Harness Accounts: each agent's Default Account, and any other login the user adds, such as a second Claude for work.

- Breaking: `harnessBinaries` and `setHarnessBinary` are `harnessAccounts`, `saveHarnessAccount` and `removeHarnessAccount`; an account has a name, a binary and a config folder.
- Breaking: `harnesses` lists one entry per Harness Account: its `account` id, its `harness` (was `name`) and the account's `name` (was `label`); `startSession`, `models` and `skills` take `account` instead of `harness`, and `UnknownHarness` is `UnknownAccount`.
- A Session runs, forks and is asked as the account it started with; Sessions stored before run as their harness's Default Account, and a Harness Binary set before is that account's.
- A first `npx @kestack/connect` downloads about 650 MB less: no bundled Claude Code, Codex or speech runtime.
