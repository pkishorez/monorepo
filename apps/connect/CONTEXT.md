# Connect

How a computer gets connected to the cloud so its User can reach it from anywhere. Code is one UI on it; later ones reach the same Machines.

## Language

**Connect**:
How a Machine is connected to the cloud so that its User can reach it from outside: the program run on the computer and the cloud part it signs in to, together. It runs until stopped. In development every branch has a Connect of its own, with its own Machines, which every App run on that branch shares.
_Avoid_: daemon (for now: it is not a background service), agent, server

**Cloud Connect**:
The cloud part of Connect: where a Machine signs in and sends its Heartbeats, and what keeps each User's Machines. A UI asks it for the Machines and then talks to each Machine itself.
_Avoid_: Connect Cloud, Connect Service, Machines Backend, registry

**App**:
One UI on Connect, such as Code, reaching the Machines Cloud Connect lists.
_Avoid_: client, frontend, product

**App Group**:
What a Machine serves for one App, such as the `code` group; every App Group is served on the Machine's one socket.
_Avoid_: plugin, module, feature

**Project**:
A folder on a Machine that Sessions run in. Removing a Project removes its Sessions with it; the folder stays as it is.
_Avoid_: workspace, repo

**Machine**:
One running Connect and the computer it runs on, signed in as one User, who alone may reach it. It keeps the same id across restarts and has a name the User can change. A Machine's Projects and Sessions are its own; another Machine of the same User has others.
_Avoid_: connection, environment, server, host, device (auth-toolkit's word for how it signs in)

**Machine Key**:
The secret a Machine asks of anyone who connects to it. It is made once and never changes; whoever holds it can reach the Machine.
_Avoid_: token (that proves a Sign-in), password, API key

**Heartbeat**:
A Machine's regular report of how it stands, carrying two signals: that it is running, shown by when it last reported, and whether it could reach itself at its public address. A Machine that stops reporting is down; one that reports but cannot reach itself is up with its tunnel broken.
_Avoid_: poll, ping, health check (the route it calls, not the concept)

**Last Seen**:
When a Machine last sent a Heartbeat. The only way to tell a Machine that stopped from one that is running.
_Avoid_: last active, updated at, online

### The code App Group

**Session**:
One Agent kept on a Machine, in one of its Projects: its Messages, its Title, and whether it is Settled. A Fork of a Session is listed as a Session of its own, not under the original, and reads what came before its Fork Point from the original rather than copying it.
_Avoid_: thread, chat, Agent (what a Session keeps), conversation

**Default Account**:
The Harness Account a Machine has for each Coding Harness it runs, even before the user sets it: the harness from PATH, on its own config folder, its id the harness's name. With no folder set, it runs in Connect's environment, so the folder it really uses is `CLAUDE_CONFIG_DIR` or `CODEX_HOME` when Connect was started with one, else `~/.claude` or `~/.codex`, and it is shown as that. It can be changed but never removed. Every other Harness Account is one the user added, such as a work login; a Session runs as one account, chosen when it starts, and keeps it.
_Avoid_: main account, primary login

**Session Status**:
How a Session stands: idle, running, or how its last Turn ended if not done: cancelled, failed, or interrupted.
_Avoid_: streaming flag

**Settled**:
A Session the user is done with: kept, but out of the way. Settling never stops a running Turn; sending the Session a message un-settles it.
_Avoid_: archived, done, hidden, closed

**Interrupted**:
A Turn cut off because its Machine stopped while it ran, found at the next start.
_Avoid_: cancelled, failed

**Title**:
A short name for a Session, written from its user messages; it can be regenerated at any time.
_Avoid_: name, label

**Bootstrap Sweep**:
The startup step that finds Turns the last run of the Machine left running and ends them interrupted.
_Avoid_: recovery, orphan reaper
