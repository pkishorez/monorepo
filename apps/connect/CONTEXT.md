# Connect

How a computer gets connected to the cloud so its User can reach it from anywhere. Code is one UI on it; later ones reach the same Connections.

## Language

**Connect**:
How a computer is connected to the cloud so that its User can reach it from outside: the Connect CLI on the computer, the Plugins it runs, and Connect Cloud, which it signs in to, together. It runs until stopped. In development every branch has a Connect of its own, with its own Connections, which every App run on that branch shares.
_Avoid_: daemon (for now: it is not a background service), agent, server

**Connect Cloud**:
The cloud part of Connect, with two jobs. Connections: where a Connection signs in and sends its Heartbeats, and what keeps and advertises each User's Connections. Releases: what decides the latest Release of each Plugin, and where each Release File is read from. It serves two APIs: the Heartbeat, which only `ke-connect` calls, and the App API, which only an App calls. An App asks it for the Connections and then talks to each Connection itself, over a Link.
_Avoid_: Cloud Connect, Connect Service, Connections Backend, registry

**Connect CLI**:
The `ke-connect` program. Its first job is the User's login; signed in, it runs a Connection.
_Avoid_: daemon, agent, the binary

**App**:
One UI on Connect, such as Code, reaching the Connections Connect Cloud lists.
_Avoid_: client, frontend, product

**Plugin**:
A program a Connection runs beside itself, for as long as the Connection runs, and keeps at the Release Connect Cloud names latest, or, while Connect Cloud cannot be reached, the one it last named, serving one RPC group. None starts until Connect Cloud first answers. An App calls it over a Link, at the Release it was built with. `code` is the first.
_Avoid_: App Group, module, feature

**Release**:
One build of a Plugin, named by the sha256 of its file, with one line on what changed. Every change to the file is a new Release. Which `ke-connect` may run it is not the Release's to say: that is the Minimum Connect.
_Avoid_: version (a Plugin has no version number), build (one that may not be a Release yet), deploy

**Release Standing**:
Where one Release of a Plugin stands, as Connect Cloud answers it: Latest, the one it names now; Older, one whose Release File it keeps but does not name; or Unknown, any other, so newer than what it runs: its deploy is pending, or failed.
_Avoid_: version check, compatibility, behind (who is behind is what an App makes of it)

**Release Log**:
Every Release of one Plugin in order, the latest last, kept in git as `src/connection/plugins/<name>/releases.json`. `pnpm release:plugin <name> "<what changed>"` appends one; a deployed Stage names the latest, and refuses to deploy a build that is not it.
_Avoid_: changelog (the package's, for people), manifest, versions file

**Release File**:
A Release's one file, kept as `<name>/<sha256>.mjs` and never changed once kept. Deployed, it is in an R2 bucket that Connect Cloud serves at `/releases/`; under `alchemy dev`, in a folder on the computer, read as a `file:` URL.
_Avoid_: shelf, registry, store (the code Plugin's records), CDN, artifact

**Minimum Connect**:
The oldest `ke-connect` Connect Cloud lets run its Plugins, one for all of them, which a person raises on purpose as `minConnect` in `package.json`. A Connection below it, or one that names no version, is Outdated: every Heartbeat it sends is answered 426, before it is read, with one line to show. `ke-connect` prints the line and exits 75. An App shows the Connection Outdated, from the version in its last Report, says to update `ke-connect`, and does not dial it.
_Avoid_: latest version (a newer `ke-connect` is no reason to update), required version, compatibility range

**Plugin State**:
Where one of a Connection's Plugins stands, as the Connection keeps it for its server: Downloading its file, Starting, Running, or Crashed with its last lines and when it is tried again. It stays on the computer: a Heartbeat does not carry it.
_Avoid_: status (a Plugin's own answer about itself), health

**Updating**:
A Plugin is Updating while its new Release downloads and starts; the tunnel stays up.
_Avoid_: upgrading, deploying, restarting

**Project**:
A folder on a Connection that Sessions run in. It knows whether its folder is there, present or missing, as its Connection last found it: the Connection looks as it starts, every minute, and at once when a Turn fails or its Skills cannot be listed, and writes it only when that changes, back to present when the folder returns. A Project is never managed: it is listed by when its Sessions were last active, and only one whose folder is missing can be removed, its Sessions with it; the folder stays as it is. Git is optional: a folder that is not a git repository is a Project as any other.
_Avoid_: workspace, repo

**Connection**:
One running Connect on a computer, signed in as one User to one Connect Cloud, with its own tunnel, folders and Plugins. It runs only while its User is signed in. A computer can run several Connections, each by a name of its own there, and each name runs once. It keeps the same id across restarts. One that signed in before starts while Connect Cloud cannot be reached, and reports once it can; its Plugins wait until then.
_Avoid_: machine, server, host, device, instance

**Signed Out**:
Connect Cloud said a Connection's Sign-in names nobody: its User is logged out, so the Connection and everything it runs stop until a new Sign-in. A Report that could not be sent, or an Auth Worker that could not be asked, says nothing of the login and changes nothing.
_Avoid_: unauthorized, disconnected, offline

**Computer Name**:
The name a Connection gives itself and reports on every Heartbeat: its computer's host name, with the name it was served as unless that is `main`, as in `Ada-MacBook (work)`. An App shows it only beside the Display Name, so two Connections given the same Display Name can be told apart.
_Avoid_: machine name, hostname (only part of it), device name

**Display Name**:
The name a User gives a Connection in an App, kept by Connect Cloud, never by the Connection, so a Heartbeat never changes it and a Connection out of reach can be renamed. Every App names a Connection by it, else by its Computer Name. Two Connections may share one.
_Avoid_: label, alias, nickname, custom name

**Link**:
The socket from an App to one Connection's Plugin, and how it stands: linking, linked or relinking. It opens at `<tunnel>/<name>/<sha256>/rpc`, the Plugin at one Release, offering the Connection Key. A socket offering any other key closes with 4401; one asking for a Release the Connection does not run closes with 4409, naming the one it runs. `ke-connect` serves it, so how a Link opens and closes changes only with a raised Minimum Connect.
_Avoid_: connection (the Connection itself), door, gateway, proxy, router

**Connection Key**:
The secret a Connection asks of anyone who connects to it. It holds one at a time, in memory, new as it starts and every hour; whoever holds the one it holds now can reach the Connection. A socket already open stays open when the key changes; a new socket offering any other closes with 4401, and an App then asks Connect Cloud for the list again.
_Avoid_: token (that proves a Sign-in), password, API key

**Heartbeat**:
A Connection's regular act of telling Connect Cloud how its tunnel stands, from the moment its port opens. Each one sends a Report, which says it is running, by when it arrives, and whether it could reach itself at its public address. It goes every 15 seconds, and at once when the tunnel comes up, moves a step in being set up, or the Connection Key changes. A Connection that stops reporting is down; one that reports but cannot reach itself is up with its tunnel broken. It is served at `/heartbeat`, and every call carries the `ke-connect` version in the `ke-connect-version` header. Connect Cloud answers each with only the Release of each Plugin to run; every Report is also how a login that has gone is found. It is the one API that must stay compatible, as `ke-connect` is the one part that can be older than the rest.
_Avoid_: poll, ping, health check (the route it calls, not the concept)

**Connection Status**:
Where a Connection's tunnel stands, the same value as its Tunnel's State: SettingUp at a step (Downloading cloudflared, Opening, or Failed), or Ready at an address, with how its last check went (Unchecked, Reachable, or Unreachable).
_Avoid_: health, state (of a Plugin)

**Report**:
What a Heartbeat carries: the Connection's id, name, Connection Key, version, and Connection Status. Connect Cloud reads it at any older version, so it may change freely.
_Avoid_: update, status message

**Last Seen**:
When a Connection last sent a Heartbeat. The only way to tell a Connection that stopped from one that is running.
_Avoid_: last active, updated at, online

### The code Plugin

**Session**:
One Agent kept on a Connection, in one of its Projects and, when that Project is a git repository, in one of its Worktrees, chosen when it starts and kept: its Messages, its Title, and whether it is Settled. A Fork of a Session is listed as a Session of its own, not under the original, runs in the original's Worktree, and reads what came before its Fork Point from the original rather than copying it.
_Avoid_: thread, chat, Agent (what a Session keeps), conversation

**Worktree**:
One working copy of a Project's git repository, on one branch: the main worktree, which holds the Project's own folder, or a linked one the Connection makes in kestack's own data folder, outside any one Connection's, so forgetting a Connection never deletes one. A Project's folder may be the repository's top or a folder inside it, as a package of a monorepo; its Sessions run in the same folder of whichever Worktree they are in. A Project whose folder is not in a git repository has none, and its Sessions run in its folder.
_Avoid_: checkout, workspace, environment

**Default Account**:
The Harness Account a Connection has for each Coding Harness it runs, even before the user sets it: the harness from PATH, on its own config folder, its id the harness's name. With no folder set, it runs in Connect's environment, so the folder it really uses is `CLAUDE_CONFIG_DIR` or `CODEX_HOME` when Connect was started with one, else `~/.claude` or `~/.codex`, and it is shown as that. It can be changed but never removed. Every other Harness Account is one the user added, such as a work login; a Session runs as one account, chosen when it starts, and keeps it.
_Avoid_: main account, primary login

**Session Status**:
How a Session stands: idle, running, or how its last Turn ended if not done: cancelled, failed, or interrupted.
_Avoid_: streaming flag

**Settled**:
A Session the user is done with: kept, but out of the way. Settling never stops a running Turn; sending the Session a message un-settles it.
_Avoid_: archived, done, hidden, closed

**Interrupted**:
A Turn cut off because its Connection stopped while it ran, found at the next start.
_Avoid_: cancelled, failed

**Title**:
A short name for a Session, written from its user messages; it can be regenerated at any time.
_Avoid_: name, label

**Bootstrap Sweep**:
The startup step that finds Turns the last run of the Connection left running, ends them Interrupted, and Resumes each once.
_Avoid_: recovery, orphan reaper

**Resumed**:
A Turn the Connection started on its own to continue one a stop cut off. A Resumed Turn that is cut off again is not Resumed again.
_Avoid_: retried, restarted, replayed
