# Connect in development

Every branch has its own Connect: its own Cloud Connect under `alchemy dev`, its own Connection, and its own folders. Every App run on that branch shares it.

## The branch

The branch is the name Portless gives this checkout. `portless get connect.kishore` prints Cloud Connect's URL:

- In the main checkout it is `https://connect.kishore.computer`, and the branch is `main`.
- In a linked git worktree Portless adds a prefix, `https://<prefix>.connect.kishore.computer`, and the branch is `<prefix>`.

The Connection is named `<host> (<branch>)`, so each branch's Connection is told apart in Code.

## Folders

| What                                    | Where                                                |
| --------------------------------------- | ---------------------------------------------------- |
| Data: database, attachments, Connection | `~/.local/share/kestack/.branches/<branch>/connect/` |
| State: `ke-connect.log`, `dev/`         | `~/.local/state/kestack/.branches/<branch>/connect/` |

`$XDG_DATA_HOME` and `$XDG_STATE_HOME` replace `~/.local/share` and `~/.local/state` when set. The cache (cloudflared, models, Speech to Text) is shared by every branch.

`dev/` holds:

- `connect.json`: the running Connect's pid, mode, Cloud Connect URL, port, Connection and whether it is ready.
- `leases/<pid>.json`: one per App dev process using Connect.
- `connect.log`: the shared Connect's output.

The lock that one dev process takes while it decides whether Connect must start is not a file: it is a TCP port on 127.0.0.1, from 20000 to 29999, derived from the path of `dev/`. That range is below every range the OS hands out for port 0 (macOS and Windows 49152–65535, Linux 32768–60999), so the Connection, which listens on port 0, never takes a lock's port; and it is clear of Portless's app ports, 4000–4999, and Connect's 4590. Holding it is listening on it, so it is freed when the process exits, however it exits. Connections to it are closed at once, so none holds up giving it back. If taking it fails after 30 s, the error names the port; when no `ke-connect` dev runs, another program owns that port.

## Signing in

`pnpm dev` signs in with auth-toolkit's Fake ([root ADR 0012](../../../docs/adr/0012-pnpm-dev-signs-in-with-the-fake.md)): Cloud Connect reads Fake Tokens, and the Connection signs in at once as `dev@kestack.test`, with no device code. A Fake Connection keeps its own folders, `<branch>-fake`, and lets in pages through a Cloudflare tunnel (`https://*.trycloudflare.com`). `pnpm dev:real` (`KESTACK_AUTH=real`) signs in through the Auth Worker, as before. `connect.json` says which (`auth`), and an App run the other way while one runs is refused: stop every dev on the branch first.

## Running an App

`pnpm dev` in an App, such as `apps/code`, calls `withConnect`:

1. Under the lock it reads `connect.json`. Connect is alive when its process runs, it says it is ready, Cloud Connect answers `/auth` and the Connection answers `/health`.
2. If no Connect runs, it starts the shared supervisor, detached from the terminal, writing to `connect.log`.
3. It takes a lease and waits until Connect is alive, showing `connect.log` meanwhile. A new branch signs in on its first run, and the device code appears there.
4. It runs the App with `CONNECT_URL` set to the branch's Cloud Connect.

Ctrl-C stops the App and gives its lease back. Once no lease has been held for 3 s, the supervisor stops the Connection, then `alchemy dev` (SIGINT, and SIGKILL after 10 s), and deletes `connect.json`.

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

The next `pnpm dev` makes a new Connection and signs in again.
