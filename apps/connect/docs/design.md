# How Connect is built

Connect is two programs on one computer and one Worker in the cloud. The
Connect CLI, `ke-connect serve`, signs its User in, and while signed in runs
one Connection: a server on its port, a tunnel to it that reports to Connect
Cloud, and one process per Plugin, at the Release Connect Cloud names. The
`code` Plugin runs in a process of its own: it holds the Projects and the
Sessions in them, runs each Session's Turns on its Agent, and keeps every
record in the Store. The CLI and the Plugin never import each other; the
server passes Code's socket to the Plugin's without reading it. Both are
Kabuki Actor trees, each started with `Runtime.start`. `laymos lint` checks
who may import whom (`laymos.config.json`).

## Folders

```
src/
├── cloud/                    Connect Cloud
│   ├── app-api/              what an App and Connect Cloud say to each other
│   ├── client/               the App's client of Connect Cloud
│   └── worker/               the Worker: app/, heartbeat/, store/ (D1)
├── heartbeat/                what a Connection and Connect Cloud say: sign-in/, report/
└── connection/               what runs on the computer
    ├── cli/                  the Connect CLI, ke-connect
    ├── link/                 how an App reaches a Plugin through a Connection
    └── plugins/code/         the code Plugin
```

The Connect CLI:

```
connection/cli/
├── cli.ts, commands/         serve, list, remove; commands/dev/ runs them in development
└── actor-identity/           signs the User in · SigningIn | SignedIn | Ended
    ├── capabilities/         CloudAccount, Control: what it stands on; Cloud: what it gives
    ├── services/             identity, account, folders, sign-in/, cloud/, control/, connection-file/
    └── actor-connection/     only while signed in · Starting | Listening
        ├── server/           the public port, who may come in, the Connection Key
        ├── actor-tunnel/     the tunnel and the Heartbeat · SettingUp | Ready
        └── one Plugin Actor per Plugin, from @kestack/cli-platform/plugins (no folder)
```

The code Plugin:

```
connection/plugins/code/
├── api/                      contract/ and client/: what Code's browser imports
├── records/                  the stored records: Projects, Sessions, Harness Accounts
├── serve/                    main.ts: the Plugin's process; its handlers and read feeds
└── engine/
    ├── engine.ts             the front door: finds an Instance, Sends a Message, asks a Query
    ├── starting.ts           where a new Session runs, and the git step that puts it there
    ├── attachments/          saves a message's files before the front door Sends it
    ├── engine-raw/           the engine's own Raw: turn.started, turn.ended, error
    ├── capabilities/         Agents, Answers, Git, Store
    ├── services/             agents, answers, folders, git, harness-accounts, store
    └── actor-code/           the Projects and Sessions · Loading | Ready
        ├── checks/           the Bootstrap Sweep as it loads, the Folder Check while Ready
        └── actor-session/    one per Session · Idle | Running
```

## How the parts talk

Three conversations, each with its own contract:

1. **The Heartbeat** (`src/heartbeat/`): a Connection signs in to Connect
   Cloud and Reports its Connection Status, address and Connection Key.
   Connect Cloud answers with the Release of each Plugin to run. It is the
   only contract kept compatible, so an older `ke-connect` can still be told
   to update (ADR 0011).
2. **The App API** (`src/cloud/app-api/`): an App lists its User's
   Connections, renames or forgets one, and asks where a Release stands.
   Both sides update themselves, so it changes freely.
3. **The Link** (`src/connection/link/`): an App reaches a Plugin straight
   through a Connection's tunnel, at `/<plugin>/<sha256>/rpc`. The server
   checks the key, passes the socket to the Plugin, and closes it with
   `KEY_EXPIRED` (4401) or `PLUGIN_MISMATCH` (4409) when it cannot.

## The Connect CLI

### Signing in (`actor-identity/`)

It ties everything to the User's login: it runs the Connection only while
signed in, is the only place that knows what a Report's answer means for the
login, and answers `status` and `stop` on the control socket.

- **The Connection is a Child in SignedIn, so logging out stops everything**,
  because Connect is tied to the login, and one rule is easy to hold: signed
  in, it runs; signed out, nothing does (ADR 0008). Caveat: a Sign-in revoked
  stops the Plugins and cuts off their Turns, which Resume once signed in again.
- **Only `Unauthenticated` is logged out**, because Connect Cloud answers it only
  once the Auth Worker said the Sign-in names nobody. A Report that could not be
  sent, an Auth Worker that could not be asked, and a crash all change nothing.
- **What an answer means for the login stops at Identity**, because the tunnel
  only needs the Releases to run. Caveat: Cloud and CloudAccount are two
  Capabilities, what Identity stands on and what it Provides.
- **who is in the State, not the Model**, because SignedIn always has one and
  only SigningIn may have none.
- **The address is learned from each Report**, because every Report already
  passes through Cloud's report, so the Tunnel needs no second way up.
- **The Sign-in lives in a Scope outside the tree**, because the signIn Worker
  ends with SigningIn, but the client it signs must outlast it. `account` is
  built before the tree starts, and signs in when asked.
- **It signs in offline, from what it kept, and its Plugins wait**, because a
  Connection whose Connect Cloud is down must still start and keep reporting:
  services/ signs in through the AuthInfo it kept in `auth.json`, with the
  Sign-in kept, when Connect Cloud cannot be asked or does not answer in five
  seconds. Its Plugins wait for Connect Cloud's first answer (ADR 0010). Caveat:
  a first Sign-in needs Connect Cloud, and a Sign-in Connect Cloud refuses once
  it answers is signed in again through the Auth Worker it names then, which
  `auth.json` keeps from there.
- **services/ is usable beside the tree**, because `list` and `remove` read and
  forget a Connection without running it.
- **What cannot go on ends it, saying why**, as a Sign-in that fails, a refusal,
  an Outdated Connection and a port that cannot be opened all do. Caveat: an
  Outdated Connection has already reported, so its User sees the version it runs.
- **answerLocal is here, not on the Connection**, because `status` and `stop`
  must answer while signing in, first or again, as while signed in. Caveat: until
  the tree runs, `hold` answers for it: `status` says starting, and `stop` ends
  the program.
- **`serve` asks the control socket before it signs in**, because a second `serve`
  of a running name must report it, not sign in again. Caveat: two started at once
  both sign in, and the second stops once the first holds the socket.

### The Connection (`actor-connection/`)

It keeps one Connection running while its User is signed in: its public
port and Connection Key, its tunnel, and its Plugins. The server passes
`/<plugin>/<sha256>/rpc` to each Plugin's socket as `/rpc` while the Plugin
runs that hash, and mints a new Connection Key every hour unless told
otherwise.

- **A Worker holding something open is not tied to a State**, because a Worker of
  a State stops as that State ends, and closes what it holds. server runs across
  Starting and Listening, holding the port, as tunnel does the tunnel below.
- **The Tunnel and the Plugins are siblings in Listening**, because a broken tunnel
  must never stop a Plugin. Neither sees the other. Caveat: what Connect Cloud
  answers still comes through the tunnel's Report, and up as Wanted.
- **The server is a Worker here, not an Actor of its own**, because a request
  comes to the Connection and the Connection keeps track of the Plugins. It holds
  one socket and has no States.
- **The key is in Listening, read on each request**, because it changes while the
  Connection runs, and a new one must need no restart. There is one key, and any
  other reads as expired; a socket already open stays open (ADR 0009).
- **The server reads which Release runs from the Plugin States**, because that is
  where each Plugin reports it. Caveat: a Plugin Starting a new Release runs none
  yet, so a socket closes with no hash until it is Running.
- **The list comes only from Connect Cloud**, because the product runs only online,
  and a file was another thing to keep in step (ADR 0010). Caveat: until Connect
  Cloud answers, no Plugin runs, and the server answers their paths with 404.
- **The Plugins running are the Plugins Connect Cloud names**, because a Report
  that succeeds says the whole list, and one that fails answers nothing. Caveat: a
  Plugin no longer named stops within a Heartbeat, cutting off its running Turns,
  and a deploy that names none stops every Plugin.
- **A Child tells its parent by Emitting**, because a Capability is too much for
  one level. Caveat: Cloud stays a Capability, because the Tunnel is two levels
  below Identity and needs its answer.

### The tunnel (`actor-tunnel/`)

It holds the door to the street, and keeps Connect Cloud told where it
stands: it opens a cloudflared tunnel, checks it, and sends the Heartbeat.

- **Its State is the Connection Status**, because what it is and what Connect Cloud
  is told are the same thing: no copy of one to keep in step with the other. Caveat:
  an App and Connect Cloud keep older values, so v1 of `ConnectionStatus` still
  reads, and so does a stored Connection from before v4.
- **A tunnel is a Worker keyed by generation, not a Child**, because a tunnel has
  no States of its own apart from the Status. A new generation is a fresh tunnel,
  and three failed checks in a row or cloudflared stopping start one.
- **tunnel is one Worker across SettingUp and Ready**, because the tunnel lives in
  its Scope: a Worker per State would close it on each step.
- **The Heartbeat lives here, in two Workers, one for each State**, because it
  reports the tunnel, and only Ready has one to check. A Worker of a State lives as
  long as that State's tag, so neither starts over on a step, a check or a key.
  Caveat: a check may take seconds, so it never holds up a new key, and Reports go
  one at a time so an older one cannot arrive after a newer one.
- **A cached cloudflared never says Downloading**, because the step only shows after
  half a second. Caveat: a Connection waiting on another's download hears of no
  bytes, so only its time rises.
- **Cloud and Tunnels are two Capabilities, not one host**, because each has one
  outside thing behind it, Connect Cloud or cloudflared, and each fake stands alone.

## The code Plugin

The engine's front door follows three rules. Everything the user does is a
Message to one Instance: a Project or a new Session to actor-code, a message,
cancel or Settle to a Session by its id. Everything the user reads is the
tree's state. Every question for a Session, a Fork, an Ask, a new Title, its
Agent's MCP Server Status and Context Usage, is a Query on the Session; what
the answer changes is a Message after it, such as AddSession for a Fork. A
new Session's git step, a branch switched or a Worktree made, runs at the
front door before it Sends StartSession (`starting.ts`), so a step that fails
starts nothing. The start is done once the new Session's Agent has opened,
its first message is written and it is saved: one that fails first is
dropped (DropSession), the Worktree and branch made for it taken back; a
folder switched for it stays switched.

### Projects (`actor-code/`)

It holds the Projects and one Session per Session in them, saves the
Projects, and runs the Bootstrap Sweep as it loads: each Turn left running
ends Interrupted, and is Resumed once.

- **Projects and Sessions are in one root, not a Project Actor between
  them**, because a Project only placed its Sessions and handed them its
  folder: a shallow Actor. RemoveProject removes that Project's Sessions
  too. Caveat: the front door finds a Session by its id among all of them.
- **The root loads itself in a Loading State, not from Input**, because the
  Bootstrap Sweep is the root's own job. Caveat: the front door waits for
  Ready before it opens.
- **Saving a Project is a Command, not a Worker**, because nothing is shown
  while it saves and nothing stops it.
- **cwd travels as Input, not as a Capability**, because only the direct
  Child reads it. It is the Session's Worktree, kept on its record, or its
  Project's folder when it has none, as a v1 Session or one in a folder
  that is not git.
- **A Resumed Turn starts from its Session's Input, not from a Message after
  Loaded**, because a parent never Sends to a Child, and a Session handed a
  Prompt already starts Running it, as a new Session does. From there it is
  a Turn like any other: steers, cancel and saves hold. Caveat: the Prompt is
  marked `resumed`, so its `turn.started` says so, and a later sweep that
  finds that Turn cut off does not Resume it again.
- **Folders is a Service of the engine, behind the front door**, because
  picking a folder to become a Project is the engine's domain, and the API
  then talks to the Engine alone. Caveat: the engine takes `home` as an
  option.
- **Git is a Capability, and services/git/ the only code that runs git**,
  because the front door, the Session's Workers and Folders all ask it, and
  git missing or failing must read the same everywhere: as not git. Caveat:
  only a start's step fails on it, as GitFailed.
- **New Worktrees go in the code Plugin's shared folder, not its data
  folder**, because a Connection forgotten deletes its data folder, and a
  Worktree may hold work not pushed. Caveat: the engine takes `worktrees` as
  an option, and nothing removes a Worktree once a Session runs in it.

### A Session (`actor-session/`)

It keeps one Agent of one Coding Harness in a Project's folder or its
Worktree, and orders its Turns. A message starts or steers a Turn. It keeps
the branch its Worktree is on, and gives the Session a Title.

- **The Turn rules stay in the Session, not in ai-toolkit**, because
  ordering Turns is Code's choice: an untaken steer becomes the next Turn,
  and an Agent-started Turn begins only while Idle. ai-toolkit gives the
  Agent as plain Effects. Caveat: another App writes its own few Updates.
- **The status is the State, not a Model field**, because Running holds data
  Idle does not.
- **The Turn is a Worker keyed by turnId, not a Child**, because a Session runs
  exactly one Turn and the Turn has no States, View or Children of its own. A
  new turnId is a fresh Worker. Caveat: the Worker reads the Turn's steers and
  cancelling from the Session's State, and ignores them once the State has
  moved on.
- **Outside questions are Queries, not Messages**, because the caller needs
  the answer, and a Message answers nothing. Caveat: a Query never Sends, so
  the front door Sends AddSession after fork, and Titled after retitle.
- **An Answer is a Message and a Command, not a Query**, because it changes
  the agent, and a Query never changes the world. Caveat: the caller still
  needs how it went, so the front door mints an Answer id and waits on it in
  Answers before it Sends, and the Command tells it there. The outcome is a
  reply to one caller, not a fact about the Session, so it never enters the
  Model; the wait goes when the call ends, however it ends.
- **The open Agent is shared through Agents, not a Provide**, because an
  Actor's own Workers, Commands and Queries cannot use its own Provide.
  Caveat: each waits for the agent Worker to keep the Agent, which every
  Session does as it starts.
- **persist is a Worker, not a Command**, because it follows every change in
  order.
- **The Branch Check is the Session's own Worker, not the root's Folder
  Check**, because the branch is on the Session's record, which only the
  Session writes, and a parent never Sends to a Child. Caveat: each Session
  not Settled runs git once a minute; a Settled one keeps its last branch.
- **The first Title renames the branch before it Sends Titled**, because
  Titled ends the title Worker. Caveat: a rename that fails or takes too
  long keeps the name, and a later Title never renames.
- **attachments/ and engine-raw/ sit beside the root, not in the Session's
  folder**, because the front door saves a message's files before it Sends,
  and the read feeds and the Bootstrap Sweep read the engine's own records.
  A Module two places use sits at the lowest folder that holds both. Caveat:
  actor-code has a Laymos Rule to engine-raw besides capabilities.
