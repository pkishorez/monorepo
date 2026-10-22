---
'@kestack/ai-toolkit': patch
---

`AiApi` is merged from six RpcGroups, harnesses, projects, sessions, turns, jobs and folders, one file each; every procedure keeps its name and the client stays one flat object (ADR 0004).

A Session has `settledAt`, null unless Settled, and `activeAt`, when a Turn last started in it or when it was made. `settleSession` and `unsettleSession` Settle it and take it back; Settling never stops a running Turn, and any message sent to it un-settles it. The Session schema is one version again: the database starts fresh.

A Fork copies nothing (ADR 0014). It keeps the original's title, without " (fork)", and `forkedFrom: { sessionId, turnId }` names the Session whose Messages hold its Fork Point; its own Messages start after it. `forkSession` also forks after a Turn a Fork inherited, from the Session that ran it, and with `afterTurnId: null` a Fork with no Turn of its own forks at its own Fork Point. Up the chain each original is read only up to the tightest Fork Point below it, so a Fork made after a Turn it inherited never reaches a later Turn of an original further up.

`listFolder { path, query? }` lists a folder's sub-folders inside the home folder, `{ path, parent, folders: { name, hidden, link }[], truncated }`, name-sorted and at most 100, hidden ones only for a query starting with `.`; `createFolder { parent, name }` makes one folder, never its parents, and runs `git init` in it, `{ path, gitInitError }`. Both refuse a path outside home, symlinks resolved, with `OutsideHome`, and fail with `FolderNotFound`, `PermissionDenied`, `FolderExists`, `InvalidFolderName` or `FolderUnreadable`. `addProject` resolves symlinks, so one folder is one Project.

The server lets a browser page in only from an allowed origin: this machine, portless's `*.localhost`, and `code.kishore.computer`, plus each `serve --origin`; `server({ origins, home })` sets both. A request without an `Origin` is let in.
