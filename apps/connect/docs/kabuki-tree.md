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
`ConnectionHost` and `Downloads`. The engine Layer gives `Store`,
`Harnesses`, `HarnessAccounts`, `OneShotPrompt`, `Agents` and `Answers`.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/connection/
  connection.ts              serve, list, remove; serve.ts builds ConnectionHost and runs the root
  actor-connection/          root; States: Online | SigningIn | Forgotten | Stopped
  ├── capabilities/          ConnectionHost
  └── ActorPlugin            each: model.wanted; from @kestack/cli-platform/plugins

src/plugins/code/engine/
  engine.ts                  the front door: finds an Instance, Sends a Message, asks a Query
  capabilities/              Agents, Answers, Store
  services/                  agents, answers, store, harness-binaries, folders
  attachments/               saves a message's files before the front door Sends it
  engine-raw/                the engine's own Raw: turn.started, turn.ended, error
  actor-code/                root; States: Loading | Ready
  └── actor-session          in Ready, each: model.sessions; States: Idle | Running
```

Around the Connection tree, `src/connection/online/` holds identity,
sign-in and the tunnel, which `serve.ts` hands the root as
`ConnectionHost`; `src/connection/cli/` is the commands, and `cli/dev/` runs
them in development; and `src/cloud/` is
Cloud Connect, which it reports to. Around the engine tree,
`src/plugins/code/records/` is what it keeps, `src/plugins/code/api/` is the
contract and the browser client, and `src/plugins/code/main.ts` serves the
engine on the socket the Connection gives it, through cli-platform's
`Plugin.make`, with `code.ts` and its handlers and read feeds.

## How it connects

Down, from the root:

```
connection Layer ─ ConnectionHost, Downloads ────────────────────────────────▶ actor-connection
actor-connection ─ Provides Plugins ─────────────────────────────────────────▶ ActorPlugin
actor-connection ─ each Plugin name; Input: name, folders, socket; Props: wanted ▶ ActorPlugin
engine Layer     ─ Store, Harnesses, HarnessAccounts, OneShotPrompt, Agents, Answers ─▶ actor-code
actor-code       ─ each session id; Input: session, cwd, first ──────────────▶ actor-session
```

Up, from the leaves:

```
ActorPlugin      ─ Request Plugins.report ────────▶ Sends PluginReported to actor-connection
actor-connection ─ Worker router, always ─────────▶ listens on the port; Sends Listening, or Stop
actor-connection ─ Worker control, always ────────▶ holds the control socket; Sends Stop
actor-connection ─ Workers tunnel, beat, signIn ──▶ Sends TunnelUp, TunnelLost, Checked, Reported, …
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

**Does**: keeps one Connection running: its router and control socket, a
tunnel to the router reported to Cloud Connect every beat, and one Plugin
Child per Plugin wanted.
**Input**: the Connection's id, name and Connection Key, its folders, its
control socket and what names its Plugins' sockets, the port, the origins
let in, and the Plugins to run from a file in development.
**Model**: the Input; listening: the router's port, null until it listens.
generation, status, failures, refusals: kept across SigningIn and Online.
wanted: the version of each Plugin to run, from Cloud Connect's answers and
the files given, which win. plugins: each Plugin State as last reported.
**States**: Online. SigningIn. Forgotten. Stopped: reason, null when asked to
stop. SignedOut moves Online to SigningIn; SignedIn moves it back. Forgotten
and Stop end it.
**Messages**: Listening: the router Worker. PluginReported: the Plugins
Request. Installing, Opening, OpenFailed, TunnelUp, TunnelLost: the tunnel
Worker. Checked: the beat Worker. Reported, SignedOut, Forgotten, Stop: the
Report's answer. SignedIn: the signIn Worker. Stop: the router and control
Workers too.
**Commands**: none.
**Workers**: router: always; listens on the port, passes `/<plugin>/…` to
each Plugin's socket; Sends Listening. control: always; holds the control
socket, answering `status` and `stop`; Sends Stop when another holds it.
tunnel: in Online, each generation while the router listens; Sends
Installing, Opening, OpenFailed, TunnelUp, TunnelLost. beat: in Online,
always; Sends Checked and the Report's answer. signIn: in SigningIn; Sends
SignedIn or Stop.
**Requires**: ConnectionHost: tunnel, beat, signIn.
**Provides**: Plugins: its Request `report` Sends PluginReported.
**Services**: none in the tree: serve.ts builds ConnectionHost from
online/'s tunnel, sign-in and Cloud Connect's client.
**Children**: plugins: each name in `wanted`; ActorPlugin from
`@kestack/cli-platform/plugins`; Input: its name, its folders inside the
Connection's, its socket; Props: the version wanted.
**View**: none.

### Decisions

- **The tunnel is a Worker keyed by generation, not a Command**, because it
  must be stopped and restarted. A new generation is a fresh tunnel.
- **The router and the control socket are Workers of the root, not
  Actors**, because each holds one socket and has no States of its own.
  Caveat: the router reads which Plugins there are from the root's changes.
- **A Plugin no longer wanted keeps running**, because an answer that names
  no Plugins, such as an older Cloud Connect's, must not stop Code. Caveat:
  a Plugin is stopped only with its Connection.
- **`serve` asks the control socket before it signs in**, because a second
  `serve` of a running name must report it, not sign in again. Caveat: two
  started at once both sign in, and the second stops once the first holds
  the socket.
- **online/ stays Modules beside the tree, not services/**, because `remove`
  uses sign-in and identity outside the tree.

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
