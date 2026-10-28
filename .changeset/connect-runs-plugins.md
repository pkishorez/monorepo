---
'@kestack/connect': patch
'@kestack/cli-platform': patch
'code': patch
---

`ke-connect` runs the code Plugin as a program of its own, which it downloads at the version Cloud Connect names and swaps while the tunnel stays up.

- Breaking: `ke-connect serve [name]` serves the Connection `name`, `main` unless given, each in folders of its own (`…/kestack/connect/connections/<name>/`); a second `serve` of a running name says so and exits 0. `--port` is any free port unless given, and `--name` and `--branch` are gone. `ke-connect list` shows every Connection; `ke-connect remove <name>` stops one, forgets it in Cloud Connect, signs it out and deletes its folders, replacing `logout`. With no command, `ke-connect` opens a wizard. Nothing is moved from the old folders: every Connection starts fresh.
- Breaking: a Connection belongs to the Cloud Connect it first signed in to; serving it with another `--cloud` is refused.
- Breaking: the code Plugin is at `wss://<tunnel>/code/rpc`, not `/rpc`; `CodeClient.layer` takes that URL.
- Breaking: the `./connection` export is gone; nothing used it but `./dev`.
- `ConnectionReport` carries each Plugin State, and `Connection` carries them too, with `wanted`, the version of each Plugin Cloud Connect wants run. Cloud Connect's Worker takes them from `PLUGINS`, JSON, empty unless set.
- `pnpm build:plugin` bundles the code Plugin into one file, `dist/plugin/code.mjs`, and prints its sha256.
- `@kestack/cli-platform`: new `./plugins/contract`, the Plugin contract without `ActorPlugin`, safe in a browser or a Worker.
- Code dials `/code/rpc`.
