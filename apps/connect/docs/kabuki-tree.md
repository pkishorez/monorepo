# Connect actor trees

Connect is two programs on one computer, each with one Kabuki tree. The
Connection tree is `ke-connect serve`: it keeps the Connection online, a
router on its port and a tunnel to it, a Heartbeat to Cloud Connect, and one
Child per Plugin that keeps that Plugin's process running at the version
wanted. The engine tree is the `code` Plugin's, in a process of its own: it
holds the Projects and the Sessions in them, runs each Session's Turns on
its Agent, and keeps every record in the Store. The two never import each
other; the router passes Code's socket to the Plugin's without reading it.
Each root runs with `Runtime.start`. The connection Layer gives
`Cloud`, `Tunnels` and `Downloads`. The engine Layer gives `Store`,
`Harnesses`, `HarnessAccounts`, `OneShotPrompt`, `Agents` and `Answers`.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/connection/
  connection.ts              serve, list, remove; serve signs in through identity/ and runs the root
  identity/                  who the Connection is: folders, connection.json, the Sign-in
  actor-connection/          root; States: Running | Forgotten | Stopped; run.ts builds Cloud and Tunnels
  ├── capabilities/          Connection: the Requests of its two parts
  ├── actor-online/          in Running; States: SignedIn | SigningIn
  │   ├── capabilities/      Cloud; TunnelStatus: the tunnel's Requests
  │   ├── services/          cloud: Cloud Connect's client, signed in
  │   └── actor-tunnel/      in SignedIn, while the router listens, key: generation; States: Opening | Installing | Up | Lost
  │       ├── capabilities/  Tunnels
  │       └── services/      quick-tunnel, binary, check
  └── actor-plugins/         always; the router
      └── ActorPlugin        each: props.wanted; from @kestack/cli-platform/plugins

src/plugins/code/engine/
  engine.ts                  the front door: finds an Instance, Sends a Message, asks a Query
  capabilities/              Agents, Answers, Store
  services/                  agents, answers, store, harness-binaries, folders
  attachments/               saves a message's files before the front door Sends it
  engine-raw/                the engine's own Raw: turn.started, turn.ended, error
  actor-code/                root; States: Loading | Ready
  └── actor-session          in Ready, each: model.sessions; States: Idle | Running
```

Around the Connection tree, `src/connection/identity/` is who the
Connection is, which `connection.ts` hands the root as Input, and its
Sign-in, which `run.ts` builds Cloud from; `src/connection/cli/` is the
commands, and `cli/dev/` runs them in development; and `src/cloud/` is
Cloud Connect, which it reports to. Around the engine tree,
`src/plugins/code/records/` is what it keeps, `src/plugins/code/api/` is the
contract and the browser client, and `src/plugins/code/main.ts` serves the
engine on the socket the Connection gives it, through cli-platform's
`Plugin.make`, with `code.ts` and its handlers and read feeds.

## How it connects

Down, from the root:

```
connection Layer ─ Cloud, Tunnels, Downloads ────────────────────────────────▶ actor-connection
actor-connection ─ Provides Connection, Plugins ─────────────────────────────▶ actor-online, actor-plugins
actor-connection ─ Props: port, plugins ────────────────────────────────────▶ actor-online
actor-connection ─ Input: key, folders, socketId, port, origins; Props: wanted ▶ actor-plugins
actor-online     ─ Provides TunnelStatus ────────────────────────────────────▶ actor-tunnel
actor-online     ─ key: generation; Input: generation; Props: port ─────────▶ actor-tunnel
actor-plugins    ─ each Plugin name; Input: name, folders, socket; Props: wanted ▶ ActorPlugin
engine Layer     ─ Store, Harnesses, HarnessAccounts, OneShotPrompt, Agents, Answers ─▶ actor-code
actor-code       ─ each session id; Input: session, cwd, first ──────────────▶ actor-session
```

Up, from the leaves:

```
ActorPlugin      ─ Request Plugins.report ────────▶ Sends PluginReported to actor-connection
actor-plugins    ─ Worker router, always ─────────▶ listens on the port; Requests Connection.listening, or stop
actor-tunnel     ─ Worker keep, always ───────────▶ holds the tunnel; Requests TunnelStatus installing, opening, up, openFailed
actor-tunnel     ─ Worker lost, in Lost ──────────▶ Requests TunnelStatus.lost
actor-online     ─ Worker beat, in SignedIn ──────▶ Sends Checked, Reported, SignedOut; Requests Connection.wanted, forgotten, stop
actor-online     ─ Worker address, always ────────▶ Requests Connection.address
actor-online     ─ Worker signIn, in SigningIn ───▶ Sends SignedIn; Requests Connection.stop
actor-connection ─ Worker control, always ────────▶ holds the control socket; Sends Stop
actor-session    ─ Worker agent, always ───────────▶ keeps the Agent in Agents
actor-session    ─ Worker turn, in Running ────────▶ appends Raw; Sends NativeId, Steered, TurnEnded
actor-session    ─ Worker cancel, while cancelling ▶ Sends TurnEnded
actor-session    ─ Worker agentTurn, in Idle ──────▶ Sends AgentTurn
actor-session    ─ Worker jobs, always ────────────▶ Sends Jobs
actor-session    ─ Worker questions, always ───────▶ Sends Questions
actor-session    ─ Worker title, while untitled ───▶ Sends Titled
actor-session    ─ Worker persist, always ─────────▶ saves the record
actor-code       ─ Worker load, in Loading ────────▶ Sends Loaded
```

The engine's front door follows three rules. Everything the user does is a
Message to one Instance: a Project or a new Session to actor-code, a message,
cancel or Settle to a Session by its id. Everything the user reads is the
tree's state. Every question for a Session, a Fork, an Ask, a new Title, its
Agent's MCP Server Status and Context Usage, is a Query on the Session; what
the answer changes is a Message after it, such as AddSession for a Fork.

## actor-connection

**Does**: keeps one Connection running: its control socket, and its two
parts, online and plugins, joined through itself alone.
**Input**: the Connection's id, name and Connection Key, its folders, its
control socket and what names its Plugins' sockets, the port, the origins
let in, and the Plugins to run from a file in development.
**Model**: the Input; listening: the router's port, null until it listens.
url: the tunnel's address, null while there is none. wanted: the version of
each Plugin to run, from Cloud Connect's answers and the files given, which
win. plugins: each Plugin State as last reported.
**States**: Running. Forgotten. Stopped: reason, null when asked to stop.
Forgotten and Stop end it.
**Messages**: Listening, Wanted, Addressed, Forgotten, Stop: the Connection
Requests. PluginReported: the Plugins Request. Stop: the control Worker too.
**Commands**: none.
**Workers**: control: always; holds the control socket, answering `status`
and `stop`; Sends Stop when another holds it.
**Requires**: none of its own.
**Provides**: Connection: listening, wanted, address, forgotten, stop, each
Sending its Message. Plugins: its Request `report` Sends PluginReported.
**Services**: none in the tree: run.ts builds Cloud and Tunnels from
actor-online's services, and `connection.ts` hands it identity/'s
Connection.
**Children**: online: in Running; Props: the router's port, each Plugin
State. plugins: always; Input: the key, folders, socket id, port and
origins; Props: wanted.
**View**: none.

### Decisions

- **The Plugins are not under online**, because a sign-out and a new
  Sign-in must not stop them: a Turn running survives it. Caveat: what
  one part learns reaches the other only through the root's Model.
- **Who the Connection is stays outside the tree, as Input**, because the
  router needs the Connection Key before it listens, and `list` and
  `remove` read the Connection without running it.
- **The control socket is a Worker of the root, not an Actor**, because it
  holds one socket and has no States of its own. Caveat: it answers the
  tunnel's address from the root's Model, which online Requests up as it
  changes.
- **A Plugin no longer wanted keeps running**, because an answer that names
  no Plugins, such as an older Cloud Connect's, must not stop Code. Caveat:
  a Plugin is stopped only with its Connection.
- **`serve` asks the control socket before it signs in**, because a second
  `serve` of a running name must report it, not sign in again. Caveat: two
  started at once both sign in, and the second stops once the first holds
  the socket.
- **identity/ stays Modules beside the tree, not services/**, because
  `remove` uses sign-in and identity outside the tree.

## actor-online

**Does**: keeps the Connection known to Cloud Connect: a tunnel to the
router, a Heartbeat every beat, and the Sign-in, signed in again when it is
revoked.
**Input**: none.
**Props**: port: the router's, null until it listens. plugins: each Plugin
State.
**Model**: generation: which tunnel this is. status: the Connection Status.
failures: failed Tunnel Checks in a row. refusals: Sign-ins refused in a
row since a Report was last taken. All kept across SignedIn and SigningIn.
**States**: SignedIn. SigningIn. SignedOut moves SignedIn to SigningIn with
a new generation; SignedIn moves it back.
**Messages**: Installing, Opening, OpenFailed, TunnelUp, TunnelLost: the
TunnelStatus Requests. Checked, Reported, SignedOut: the beat Worker and a
Report's answer. SignedIn: the signIn Worker.
**Commands**: none.
**Workers**: beat: in SignedIn; checks the tunnel, then Reports; Sends
Checked and the answer, and Requests Connection.wanted, forgotten or stop.
address: always; Requests Connection.address as the status's address
changes. signIn: in SigningIn; waits the back-off, signs in again; Sends
SignedIn or Requests Connection.stop.
**Requires**: Cloud: beat, signIn, TunnelStatus. Tunnels: beat's check.
Connection: beat, address, signIn.
**Provides**: TunnelStatus: installing, opening, openFailed and up Send
their Message and Report at once; lost Sends TunnelLost.
**Services**: cloud: Cloud from Cloud Connect's client, signed in.
**Children**: tunnel: in SignedIn, while the port is known, key: the
generation; Input: the generation; Props: the port.
**View**: none.

### Decisions

- **Cloud and Tunnels are two Capabilities, not one ConnectionHost**,
  because each has one outside thing behind it, Cloud Connect or
  cloudflared, and each fake stands alone.
- **The Tunnel Check is the beat's, not the tunnel's**, because a beat
  checks, then Reports what it found; three failed checks in a row are a
  new generation here. Caveat: online Requires Tunnels for `check` only.
- **The tunnel's word is Reported inside its Request**, because the app
  waits on a download begun or a tunnel up or failed, and the tunnel waits
  for that Report before it goes on. Caveat: a Request that Reports needs
  Cloud and Connection, so TunnelStatus is built from them.

## actor-tunnel

**Does**: holds one tunnel to the router's port, of one generation, until
it is lost.
**Input**: generation.
**Props**: port: the router's.
**Model**: generation.
**States**: Opening. Installing. Up: url. Lost: problem, null when it
closed on its own. Installing, Installed, Opened, OpenFailed and Closed
move it along; Lost is its end.
**Messages**: Installing, Installed, Opened, OpenFailed, Closed: the keep
Worker.
**Commands**: none.
**Workers**: keep: always; gets cloudflared, saying Installing after half a
second, opens the tunnel and holds it until it closes; Sends each step and
Requests it of TunnelStatus. lost: in Lost; Requests TunnelStatus.lost, at
once when it closed, five seconds after when it could not open.
**Requires**: Tunnels: keep. TunnelStatus: keep, lost.
**Provides**: none.
**Services**: quick-tunnel, binary and check, which run.ts makes Tunnels
from.
**Children**: none.
**View**: none.

### Decisions

- **The tunnel is an Actor keyed by generation, not a Worker**, because it
  has States of its own, Installing, Up and Lost, and a Capability of its
  own behind it. A new generation is a fresh tunnel. Caveat: online decides
  when that is, and a word from a tunnel already replaced is dropped by its
  generation.
- **keep is one Worker across Opening, Installing and Up**, because the
  tunnel lives in its Scope: a Worker per State would close it on each
  step.

## actor-plugins

**Does**: serves the Connection's Plugins: the router on its public port,
and one Plugin Child per Plugin wanted.
**Input**: the Connection Key, its folders, what names its Plugins'
sockets, the port, and the origins let in.
**Props**: wanted: the version of each Plugin to run.
**Model**: the Input.
**States**: none.
**Messages**: none.
**Commands**: none.
**Workers**: router: always; listens on the port, checks the Connection
Key, passes `/<plugin>/…` to each Plugin's socket; Requests
Connection.listening, or stop when it cannot listen.
**Requires**: Connection: router.
**Provides**: none: its Plugins report through the root's Plugins.
**Services**: none.
**Children**: plugins: each name in wanted; ActorPlugin from
`@kestack/cli-platform/plugins`; Input: its name, its folders inside the
Connection's, its socket; Props: the version wanted.
**View**: none.

### Decisions

- **The router lives with the Plugins, not with the tunnel**, because it
  passes requests to their sockets and reads which there are from wanted.
  The tunnel gets the port as Props, through the root and online. Caveat:
  the router reads wanted from its Props as they change.
- **The router is a Worker, not an Actor**, because it holds one socket and
  has no States of its own.
- **The Plugins report to the root, not to actor-plugins**, because the
  root is where online reads them from; Plugins reaches every Actor below
  the root.

## actor-code

**Does**: holds the Projects and one Session Child per Session in them, and
saves the Projects.
**Input**: none.
**Model**: projects: every Project. sessions: each Session as it was first
handed over, with its folder and the Prompt it starts Running or null: a new
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
  Child reads it.
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

## actor-session

**Does**: keeps one Agent of one Coding Harness in a Project's folder, and
orders its Turns. A message starts or steers a Turn.
**Input**: the stored session, cwd, the Prompt it starts Running or null: a
first message, or a Resume.
**Model**: session: the record without status. cwd. untitled: the first
message until it has a title. jobs and refusedStops: the Background Jobs the
Agent last listed and the stops it refused, in memory only. questions: the
Agent Questions the Agent last listed, in memory only.
**States**: Idle: ended. Running: turnId, prompt, steers, cancelling, queued.
Send and AgentTurn move Idle to Running; a Session handed a Prompt starts
Running. TurnEnded moves Running to Idle, or
to a new Running for a steer the Agent did not take or a message sent while
cancelling.
**Messages**: Send, Cancel, Settle, Unsettle, StopJob, Answer, Titled: the
front door. TurnEnded, NativeId, Steered: the turn and cancel
Workers. AgentTurn: the agentTurn Worker. Jobs: the jobs Worker. Questions:
the questions Worker. Titled: the title Worker. JobStopFailed: the StopJob
Command.
**Commands**: StopJob: ends with JobStopFailed when the harness refuses, or
with nothing. AnswerQuestion: gives the Agent the answer and tells the
waiting caller in Answers how it went, the harness's reason when it refuses;
ends with nothing. AnswerNotAsked: tells the waiting caller its question is
no longer asked; ends with nothing.
**Workers**: agent: always; keeps the Agent in Agents, opened on first use.
jobs: always; Sends Jobs. questions: always; Sends Questions. persist: always; saves each changed record. title:
while untitled; asks OneShotPrompt; Sends Titled. agentTurn: in Idle; Sends
AgentTurn. turn: in Running, each turnId; appends Raw, Sends NativeId,
Steered, TurnEnded. cancel: in Running, while cancelling; Sends TurnEnded
after the grace period.
**Queries**: fork: a new Session record after a finished Turn. ask: the
Agent's answer to a question. retitle: a Title from the latest messages, or
null. mcpStatus, contextUsage: from the open Agent; AgentClosed while closed.
**Requires**: Agents: agent, jobs, questions, agentTurn, turn, cancel,
StopJob, AnswerQuestion, mcpStatus, contextUsage. Answers: AnswerQuestion,
AnswerNotAsked. Store: persist, turn, fork, retitle. Harnesses:
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
- **attachments/ and engine-raw/ sit beside the root, not in the Session's
  folder**, because the front door saves a message's files before it Sends,
  and the read feeds and the Bootstrap Sweep read the engine's own records.
  A Module two places use sits at the lowest folder that holds both. Caveat:
  actor-code has a Laymos Rule to engine-raw besides capabilities.
