# Connect

How a computer gets connected to the cloud so its User can reach it from anywhere. Code is one UI on it; later ones reach the same Connections.

## Language

**Connect**:
How a computer is connected to the cloud so that its User can reach it from outside: the program run on the computer and the cloud part it signs in to, together. It runs until stopped. In development every branch has a Connect of its own, with its own Connections, which every App run on that branch shares.
_Avoid_: daemon (for now: it is not a background service), agent, server

**Cloud Connect**:
The cloud part of Connect: where a Connection signs in and sends its Heartbeats, what keeps each User's Connections, what decides the latest Release of each Plugin, and where the Shelf is read from. A UI asks it for the Connections and then talks to each Connection itself.
_Avoid_: Connect Cloud, Connect Service, Connections Backend, registry

**App**:
One UI on Connect, such as Code, reaching the Connections Cloud Connect lists.
_Avoid_: client, frontend, product

**Plugin**:
A program a Connection runs beside itself and keeps at the Release Cloud Connect names latest, or, while Cloud Connect cannot be reached, the one it last named, serving one RPC group. An App calls it at the Release it was built with, `<tunnel>/<name>/<sha256>/rpc`; a Connection running another closes the socket with 4409, naming the one it runs. `code` is the first.
_Avoid_: App Group, module, feature

**Release**:
One build of a Plugin, named by the sha256 of its file, with one line on what changed. Every change to the file is a new Release. Which `ke-connect` may run it is not the Release's to say: that is the Minimum Connect.
_Avoid_: version (a Plugin has no version number), build (one that may not be a Release yet), deploy

**Release Log**:
Every Release of one Plugin in order, the latest last, kept in git as `src/plugins/<name>/releases.json`. `pnpm release:plugin <name> "<what changed>"` appends one; a deployed Stage names the latest, and refuses to deploy a build that is not it.
_Avoid_: changelog (the package's, for people), manifest, versions file

**Shelf**:
Where each Release's file is kept, as `<name>/<sha256>.mjs`, never changed once put there. Deployed, it is an R2 bucket that Cloud Connect serves at `/plugins/`; under `alchemy dev`, a folder on the computer, read as a `file:` URL.
_Avoid_: registry, store (the code Plugin's records), CDN, bucket (only one kind of Shelf)

**Minimum Connect**:
The oldest `ke-connect` Cloud Connect lets run its Plugins, one for all of them, which a person raises on purpose as `minConnect` in `package.json`. A Connection below it is Outdated: it reports once, so its User sees the version it runs, then stops, and an App says to update `ke-connect`.
_Avoid_: latest version (a newer `ke-connect` is no reason to update), required version, compatibility range

**Plugin State**:
Where one of a Connection's Plugins stands, as its Heartbeat reports it: Downloading its file, Starting, Running, or Crashed with its last lines and when it is tried again.
_Avoid_: status (a Plugin's own answer about itself), health

**Updating**:
A Plugin is Updating while its new Release downloads and starts; the tunnel stays up.
_Avoid_: upgrading, deploying, restarting

**Project**:
A folder on a Connection that Sessions run in. It knows whether its folder is there, present or missing, as its Connection last found it: the Connection looks as it starts, every minute, and at once when a Turn fails or its Skills cannot be listed, and writes it only when that changes, back to present when the folder returns. Removing a Project removes its Sessions with it; the folder stays as it is.
_Avoid_: workspace, repo

**Connection**:
One running Connect on a computer, signed in as one User to one Cloud Connect, with its own tunnel, folders and Plugins. A computer can run several Connections, each by a name of its own there, and each name runs once. It keeps the same id across restarts. One that signed in before starts while Cloud Connect cannot be reached, and reports once it can.
_Avoid_: machine, server, host, device, instance

**Link**:
The socket from an App to one Connection, and how it stands: linking, linked or relinking.
_Avoid_: connection (the Connection itself)

**Connection Key**:
The secret a Connection asks of anyone who connects to it. It is made once and never changes; whoever holds it can reach the Connection.
_Avoid_: token (that proves a Sign-in), password, API key

**Heartbeat**:
A Connection's regular report of how it stands, carrying two signals: that it is running, shown by when it last reported, and whether it could reach itself at its public address; and the Plugin State of each of its Plugins. A Connection that stops reporting is down; one that reports but cannot reach itself is up with its tunnel broken. Cloud Connect answers each with the latest Release of each Plugin to run, and the Minimum Connect.
_Avoid_: poll, ping, health check (the route it calls, not the concept)

**Last Seen**:
When a Connection last sent a Heartbeat. The only way to tell a Connection that stopped from one that is running.
_Avoid_: last active, updated at, online

### The code Plugin

**Session**:
One Agent kept on a Connection, in one of its Projects: its Messages, its Title, and whether it is Settled. A Fork of a Session is listed as a Session of its own, not under the original, and reads what came before its Fork Point from the original rather than copying it.
_Avoid_: thread, chat, Agent (what a Session keeps), conversation

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
