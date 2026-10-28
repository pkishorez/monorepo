---
'@kestack/connect': patch
'@kestack/cli-platform': patch
'@kestack/auth-toolkit': patch
'code': patch
---

Every Plugin runs at a Release Cloud Connect names, and Code calls it at the Release it was built with.

**Breaking:** ke-connect, Cloud Connect and Code must update together; nothing reads data from earlier releases. Update with `npm i -g @kestack/connect@latest`, and delete an old `code.db`.

- Each Plugin is served only at `/<plugin>/<sha256>/rpc`; another Release gets close code 4409, `PLUGIN_MISMATCH`.
- A Connection older than the Minimum Connect stops and says how to update. It starts its Plugins at the last wanted Releases while Cloud Connect is down.
- A Connection that signed in before starts while Cloud Connect is down.
- Cloud Connect has its own export, `@kestack/connect/cloud`; those names left `@kestack/connect/code`.
- `pnpm release:plugin` builds a Plugin and adds it to its Release Log.
- `@kestack/cli-platform`: `Downloads.fetch` takes `file:` URLs. A new Plugin process starts only after the old one exits. Of many `single` claims at once, exactly one wins.
- `@kestack/auth-toolkit`: a Device's `url` may be an Effect, so it follows an Auth Worker that moves.
