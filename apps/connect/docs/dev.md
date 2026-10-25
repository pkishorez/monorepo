# Connect in development

Every branch has its own Connect: its own Cloud Connect under `alchemy dev`, its own Machine, and its own folders. Every App run on that branch shares it.

## The branch

The branch is the name Portless gives this checkout. `portless get connect.kishore` prints Cloud Connect's URL:

- In the main checkout it is `https://connect.kishore.computer`, and the branch is `main`.
- In a linked git worktree Portless adds a prefix, `https://<prefix>.connect.kishore.computer`, and the branch is `<prefix>`.

The Machine is named `<host> (<branch>)`, so each branch's Machine is told apart in Code.

## Folders

| What                                 | Where                                                |
| ------------------------------------ | ---------------------------------------------------- |
| Data: database, attachments, Machine | `~/.local/share/kestack/.branches/<branch>/connect/` |
| State: `ke-connect.log`, `dev/`      | `~/.local/state/kestack/.branches/<branch>/connect/` |

`$XDG_DATA_HOME` and `$XDG_STATE_HOME` replace `~/.local/share` and `~/.local/state` when set. The cache (cloudflared, models, Speech to Text) is shared by every branch.

`dev/` holds:

- `lock`: taken while a dev process decides whether Connect must start. A lock whose process is dead, or older than 60 s, is taken over.
- `connect.json`: the running Connect's pid, mode, Cloud Connect URL, port, Machine and whether it is ready.
- `leases/<pid>.json`: one per App dev process using Connect.
- `connect.log`: the shared Connect's output.

## Running an App

`pnpm dev` in an App, such as `apps/code`, calls `withConnect`:

1. Under the lock it reads `connect.json`. Connect is alive when its process runs, it says it is ready, Cloud Connect answers `/auth` and the Machine answers `/health`.
2. If no Connect runs, it starts the shared supervisor, detached from the terminal, writing to `connect.log`.
3. It takes a lease and waits until Connect is alive, showing `connect.log` meanwhile. A new branch signs in on its first run, and the device code appears there.
4. It runs the App with `CONNECT_URL` set to the branch's Cloud Connect.

Ctrl-C stops the App and gives its lease back. Once no lease has been held for 3 s, the supervisor stops the Machine, then `alchemy dev` (SIGINT, and SIGKILL after 10 s), and deletes `connect.json`.

## Running Connect itself

`pnpm dev` in `apps/connect` runs Connect in the foreground, its output in the terminal. Ctrl-C stops it, warning first about any App still using it; those Apps lose Connect.

If a Connect already runs for the branch, it attaches instead: it takes a lease, follows `connect.log`, and Ctrl-C only detaches.

## When it fails

- **"Portless's proxy is not running"**: the detached supervisor has no terminal, so it cannot start the proxy, which may need sudo. Run `portless proxy start`, then `pnpm dev` again.
- **"Connect stopped before it was ready"**: read `connect.log` in the branch's `dev/` folder.
- **TLS errors reaching `*.kishore.computer`**: Node needs Portless's CA. Set `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`.
- **A Connect that will not stop**: `pgrep -fl supervisor.js` finds it. Kill it and delete `connect.json`.

## Resetting a branch

Stop every dev on the branch, then delete its folders:

```sh
rm -rf ~/.local/share/kestack/.branches/<branch> ~/.local/state/kestack/.branches/<branch>
```

The next `pnpm dev` makes a new Machine and signs in again.
