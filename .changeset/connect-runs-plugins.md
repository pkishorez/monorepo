---
'@kestack/connect': patch
---

`ke-connect` runs the code Plugin as its own process, downloaded at the version Cloud Connect names.

- Breaking: `ke-connect serve [name]` runs the Connection `name` (default `main`) in its own folders. `list` shows every Connection; `remove <name>` replaces `logout`. `--name` and `--branch` are gone.
- Breaking: a Connection belongs to the Cloud Connect it first signed in to.
- Breaking: the `./connection` export is gone.
- `pnpm build:plugin` bundles the code Plugin into one file.
- `@kestack/cli-platform`: new `./plugins/contract`, safe in a browser or Worker.
