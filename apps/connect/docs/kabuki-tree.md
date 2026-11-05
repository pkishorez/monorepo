# Connect actor trees

Connect is two programs on one computer, each with one Kabuki tree. The
Connect CLI's tree is `ke-connect serve`: it signs its User in, and while
signed in runs one Connection: a router on its port, a tunnel to it that
reports to Connect Cloud, and one Child per Plugin that keeps that Plugin's
process running at the Release wanted. The engine tree is the `code` Plugin's,
in a process of its own: it holds the Projects and the Sessions in them, runs
each Session's Turns on its Agent, and keeps every record in the Store. The two
never import each other; the router passes Code's socket to the Plugin's
without reading it. Each root runs with `Runtime.start`. The CLI's Layer gives
`CloudAccount`, `Tunnels`, `Control` and `Downloads`. The engine Layer gives
`Store`, `Harnesses`, `HarnessAccounts`, `OneShotPrompt`, `Agents`, `Answers`
and `Git`.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/connection/cli/
  cli.ts                     serve, list, remove; serve runs the root
  commands/                  the commands' flags and arguments; dev/ runs them in development
  actor-identity/            root; States: SigningIn | SignedIn | Forgotten | Stopped; run.ts starts it
  ├── capabilities/          CloudAccount: what it stands on; Cloud, Identity: what it Provides
  ├── services/              account: Connect Cloud's client, signed in; folders, connection.json, the Sign-in
  └── actor-connection/      in SignedIn; the router
      ├── capabilities/      Connection: the tunnel's Requests
      ├── actor-tunnel/      while the router listens; States: the Connection Status
      │   ├── capabilities/  Tunnels
      │   └── services/      quick-tunnel, binary, check
      └── ActorPlugin        each: model.wanted; from @kestack/cli-platform/plugins

src/connection/plugins/code/engine/
  engine.ts                  the front door: finds an Instance, Sends a Message, asks a Query
  starting.ts                where a new Session runs, and the git step that puts it there
  capabilities/              Agents, Answers, Git, Store
  services/                  agents, answers, store, harness-binaries, folders, git
  attachments/               saves a message's files before the front door Sends it
  engine-raw/                the engine's own Raw: turn.started, turn.ended, error
  actor-code/                root; States: Loading | Ready
  └── actor-session          in Ready, each: model.sessions; States: Idle | Running
```

Around the CLI's tree, `src/cloud/` is Connect Cloud, which it reports to.
Around the engine tree, `src/connection/plugins/code/records/` is what it keeps,
`src/connection/plugins/code/api/` is the contract and the browser client, and
`src/connection/plugins/code/serve/main.ts` serves the engine on the socket the
Connection gives it, through cli-platform's `Plugin.make`, with `serve.ts` and
its handlers and read feeds.

## How it connects

Down, from the root:

```
CLI Layer        ─ CloudAccount, Tunnels, Control, Downloads ────────────────▶ actor-identity
actor-identity   ─ Provides Cloud, Identity ─────────────────────────────────▶ actor-connection and below
actor-identity   ─ Input: id, key, name, folders, socketId, control, port, origins, lastWanted ▶ actor-connection
actor-connection ─ Provides Connection, Plugins ─────────────────────────────▶ actor-tunnel, ActorPlugin
actor-connection ─ while listening; Input: port ─────────────────────────────▶ actor-tunnel
actor-connection ─ each Plugin name; Input: name, folders, socket; Props: wanted ▶ ActorPlugin
engine Layer     ─ Store, Harnesses, HarnessAccounts, OneShotPrompt, Agents, Answers, Git ▶ actor-code
actor-code       ─ each session id; Input: session, cwd, first ──────────────▶ actor-session
```

Up, from the leaves:

```
ActorPlugin      ─ Request Plugins.report ────────▶ Sends PluginReported to actor-connection
actor-tunnel     ─ Worker keep, each generation ──▶ holds the tunnel; Sends Installing, Opening, Up, OpenFailed, Lost
actor-tunnel     ─ Worker beat, always ───────────▶ checks, Sends Checked; Requests Cloud.report, Connection.wanted
actor-tunnel     ─ Worker told, always ───────────▶ Requests Cloud.report as a change the app waits on happens
actor-tunnel     ─ Worker address, always ────────▶ Requests Connection.address
actor-connection ─ Worker router, always ─────────▶ listens on the port; Sends Listening, or Requests Identity.stop
actor-connection ─ Worker control, always ────────▶ answers on the control socket; Requests Identity.stop
actor-connection ─ Worker remember, always ───────▶ keeps the Releases wanted in wanted.json
actor-identity   ─ Worker signIn, in SigningIn ───▶ Sends SignedIn, or Stop
actor-session    ─ Worker agent, always ───────────▶ keeps the Agent in Agents
actor-session    ─ Worker turn, in Running ────────▶ appends Raw; Sends NativeId, Steered, TurnEnded
actor-session    ─ Worker cancel, while cancelling ▶ Sends TurnEnded
actor-session    ─ Worker agentTurn, in Idle ──────▶ Sends AgentTurn
actor-session    ─ Worker jobs, always ────────────▶ Sends Jobs
actor-session    ─ Worker questions, always ───────▶ Sends Questions
actor-session    ─ Worker title, while untitled ───▶ renames a new Worktree's branch; Sends BranchFound, Titled
actor-session    ─ Worker branch, while not Settled ▶ Sends BranchFound
actor-session    ─ Worker persist, always ─────────▶ saves the record
actor-code       ─ Worker load, in Loading ────────▶ Sends Loaded
```

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

## actor-identity

**Does**: ties everything to the User's login: runs the Connection only while
signed in, and is the only place that knows what a Report's answer means for
the login.
**Input**: the Connection's name on this computer, its folders, its control
socket and what names its Plugins' sockets, the port, and the origins let in.
**Model**: the Input; who: the Connection's id and Connection Key, null until
first signed in. lastWanted: the Release of each Plugin it last wanted, read
from `wanted.json` as it signs in. refusals: Sign-ins refused in a row since a
Report was last taken.
**States**: SigningIn. SignedIn. Forgotten. Stopped: reason, null when asked to
stop. SignedIn moves SigningIn to SignedIn; SignedOut moves it back. Forgotten
and Stop end it.
**Messages**: SignedIn: the signIn Worker. Reported, SignedOut, Forgotten: Cloud's
report, from what Connect Cloud answered. Stop: the same, the signIn Worker, and
the Identity Request.
**Commands**: none.
**Workers**: signIn: in SigningIn; signs in for the first time, or after waiting
the back-off signs in again; Sends SignedIn or Stop.
**Requires**: CloudAccount: signIn, Cloud's report.
**Provides**: Cloud: `every`, and `report`, which answers with the Releases to run
or null, and Sends what any other answer means. Identity: `stop`.
**Services**: account: signing in, signing in again, and a Report, on Connect
Cloud's client.
**Children**: connection: in SignedIn; Input: who it is and where it runs.
**View**: none.

### Decisions

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
- **The Sign-in lives in a Scope outside the tree**, because the signIn Worker
  ends with SigningIn, but the client it signs must outlast it. `account` is
  built before the tree starts, and signs in when asked.
- **What it last wanted is read as it signs in, not at the start**, because a
  Connection started again after logging out should run the Releases it wanted
  last, not those of when the program started.
- **It starts offline, from what it kept**, because a computer whose Connect
  Cloud is down must still run Code: services/ signs in through the AuthInfo it
  kept in `auth.json`, with the Sign-in kept, when Connect Cloud cannot be asked
  or does not answer in five seconds. Caveat: a first Sign-in needs Connect
  Cloud, and a Sign-in Connect Cloud refuses once it answers is signed in again
  through the Auth Worker it names then, which `auth.json` keeps from there.
- **services/ is usable beside the tree**, because `list` and `remove` read and
  forget a Connection without running it.
- **An Outdated Connection stops**, as any stop with a reason does. Caveat: it
  has already reported, so its User sees the version it runs.

## actor-connection

**Does**: keeps one Connection running while its User is signed in: its public
port, its tunnel, and its Plugins.
**Input**: the Connection's id, name and Connection Key, its folders, its control
socket and what names its Plugins' sockets, the port, the origins let in, and
lastWanted.
**Model**: the Input; listening: the router's port, null until it listens. url:
the tunnel's address, null while there is none. wanted: the Release of each Plugin
to run: lastWanted at first, then Connect Cloud's answers, which win over it.
plugins: each Plugin State as last reported.
**States**: none.
**Messages**: Listening: the router Worker. Wanted, Addressed: the Connection
Requests. PluginReported: the Plugins Request.
**Commands**: none.
**Workers**: router: always; listens on the port, checks the Connection Key,
passes `/<plugin>/<sha256>/rpc` to each Plugin's socket as `/rpc` while the Plugin
is Running that hash, and closes a WebSocket for any other with 4409, or answers
409, naming the hash it runs; any other path is 404. control: always; answers
`status` and `stop` on the control socket. remember: always; writes the Releases in
wanted to `wanted.json` each time they change.
**Requires**: Control: control. Identity: router, control.
**Provides**: Connection: wanted, address, each Sending its Message. Plugins: its
Request `report` Sends PluginReported.
**Services**: none.
**Children**: tunnel: while listening; Input: the port. plugins: each name in
wanted; ActorPlugin from `@kestack/cli-platform/plugins`; Input: its name, its
folders inside the Connection's, its socket; Props: the Release wanted.
**View**: none.

### Decisions

- **The router is a Worker here, not an Actor of its own**, because a request
  comes to the Connection and the Connection keeps track of the Plugins. It holds
  one socket and has no States.
- **The tunnel never sees the Plugins**, because a Report says only how the tunnel
  stands. Caveat: what Connect Cloud answers still comes through the tunnel's
  Report, and up to the Connection.
- **The router reads which Release runs from the Plugin States**, because that is
  where each Plugin reports it. Caveat: a Plugin Starting a new Release runs none
  yet, so a socket closes with no hash until it is Running.
- **A Plugin no longer wanted keeps running**, because an answer says which
  Release of a Plugin to run, not which Plugins: one that names none must not stop
  Code. Caveat: it stays in `wanted.json` too, so nothing yet retires a Plugin.
- **The control Worker answers only while the Connection runs**, because `hold`
  answers for it otherwise: while signing in, first or again, `status` says
  starting, and `stop` ends the program.
- **`serve` asks the control socket before it signs in**, because a second `serve`
  of a running name must report it, not sign in again. Caveat: two started at once
  both sign in, and the second stops once the first holds the socket.

## actor-tunnel

**Does**: holds the door to the street, and keeps Connect Cloud told where it
stands.
**Input**: port: the router's.
**Model**: port. generation: which tunnel this is. failures: failed Tunnel Checks
in a row.
**States**: the Connection Status, the very value a Report carries: Installing.
Opening. OpenFailed: when, problem. Unchecked: url. Reachable: url, when.
Unreachable: url, when, problem.
**Messages**: Installing, Opening, Up, OpenFailed, Lost: the keep Worker. Checked:
the beat Worker. Each carries its generation, so a word from a tunnel already
replaced is dropped.
**Commands**: none.
**Workers**: keep: each generation; gets cloudflared, saying Installing after half
a second, opens the tunnel and holds it until it closes, or waits five seconds
when it could not open; Sends Lost either way. beat: always; checks the tunnel,
then Reports. told: always; Reports each change the app waits on as it happens.
address: always; Requests Connection.address as the address changes.
**Requires**: Tunnels: keep, beat. Cloud: beat, told. Connection: beat, told,
address.
**Provides**: none.
**Services**: quick-tunnel, binary and check, which run.ts makes Tunnels from.
**Children**: none.
**View**: none.

### Decisions

- **Its State is the Connection Status**, because what it is and what Connect Cloud
  is told are the same thing: no copy of one to keep in step with the other.
- **A tunnel is a Worker keyed by generation, not a Child**, because a tunnel has
  no States of its own apart from the Status. A new generation is a fresh tunnel,
  and three failed checks in a row start one.
- **keep is one Worker across Opening, Installing and Up**, because the tunnel
  lives in its Scope: a Worker per State would close it on each step.
- **The Heartbeat lives here**, because it reports the tunnel, and checks it first.
- **Cloud and Tunnels are two Capabilities, not one host**, because each has one
  outside thing behind it, Connect Cloud or cloudflared, and each fake stands alone.

## actor-code

**Does**: holds the Projects and one Session Child per Session in them, and
saves the Projects.
**Input**: none.
**Model**: projects: every Project. sessions: each Session as it was first
handed over, with where it runs, its Worktree or else its Project's folder,
and the Prompt it starts Running or null: a new
Session's first message, or the one that Resumes a Turn the Bootstrap Sweep
found cut off. Both are kept for the whole life and are empty while Loading.
**States**: Loading: nothing. Ready: nothing. Loaded moves Loading to Ready.
**Messages**: Loaded: the load Worker. AddProject, RemoveProject,
StartSession, AddSession: the front door.
**Commands**: SaveProject: ends with nothing. RemoveProject: ends with nothing.
**Workers**: load: in Loading; runs the Bootstrap Sweep, which ends each Turn
left running Interrupted and makes a Prompt to Resume it once; Sends Loaded.
**Requires**: Store: the load Worker and both Commands.
**Provides**: none.
**Services**: none.
**Children**: sessions: in Ready, each session id; Input: the session, cwd,
the Prompt it starts Running or null.
**View**: none.

### Decisions

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

## actor-session

**Does**: keeps one Agent of one Coding Harness in a Project's folder or its
Worktree, and orders its Turns. A message starts or steers a Turn. Keeps the
branch its Worktree is on.
**Input**: the stored session, cwd, the Prompt it starts Running or null: a
first message, or a Resume.
**Model**: session: the record without status. cwd. untitled: the first
message until it has a title. jobs and refusedStops: the Background Jobs the
Agent last listed and the stops it refused, in memory only. questions: the
Agent Questions the Agent last listed, in memory only. The record holds
its Worktree and the branch it was last found on.
**States**: Idle: ended. Running: turnId, prompt, steers, cancelling, queued.
Send and AgentTurn move Idle to Running; a Session handed a Prompt starts
Running. TurnEnded moves Running to Idle, or
to a new Running for a steer the Agent did not take or a message sent while
cancelling.
**Messages**: Send, Cancel, Settle, Unsettle, StopJob, Answer, Titled: the
front door. TurnEnded, NativeId, Steered: the turn and cancel
Workers. AgentTurn: the agentTurn Worker. Jobs: the jobs Worker. Questions:
the questions Worker. Titled: the title Worker. BranchFound: the branch and
title Workers. JobStopFailed: the StopJob Command.
**Commands**: StopJob: ends with JobStopFailed when the harness refuses, or
with nothing. AnswerQuestion: gives the Agent the answer and tells the
waiting caller in Answers how it went, the harness's reason when it refuses;
ends with nothing. AnswerNotAsked: tells the waiting caller its question is
no longer asked; ends with nothing.
**Workers**: agent: always; keeps the Agent in Agents, opened on first use.
jobs: always; Sends Jobs. questions: always; Sends Questions. persist: always; saves each changed record. title:
while untitled; asks OneShotPrompt; renames a new Worktree's branch
`ke-code/<id>`, never pushed, for the Title, and Sends BranchFound; Sends
Titled. branch: while not Settled; reads the branch as it starts, then
every minute; Sends BranchFound when it changed. agentTurn: in Idle; Sends
AgentTurn. turn: in Running, each turnId; appends Raw, Sends NativeId,
Steered, TurnEnded. cancel: in Running, while cancelling; Sends TurnEnded
after the grace period.
**Queries**: fork: a new Session record after a finished Turn. ask: the
Agent's answer to a question. retitle: a Title from the latest messages, or
null. mcpStatus, contextUsage: from the open Agent; AgentClosed while closed.
**Requires**: Agents: agent, jobs, questions, agentTurn, turn, cancel,
StopJob, AnswerQuestion, mcpStatus, contextUsage. Answers: AnswerQuestion,
AnswerNotAsked. Git: branch, title. Store: persist, turn, fork, retitle. Harnesses:
agent, fork, ask. HarnessAccounts: agent, fork, ask, title, retitle. OneShotPrompt:
title, retitle.
**Provides**: none.
**Services**: none in the tree: services/agents/ keeps each Agent, opened on
first use and kept across Turns; services/answers/ keeps each caller waiting
on an Answer, for as long as it waits.
**Children**: none.
**View**: none.

### Decisions

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
