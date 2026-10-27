# Connect actor trees

Connect is one program on one computer. It has two Kabuki trees that never
touch. The engine tree is the `code` App Group's: it holds the Projects and
the Sessions in them, runs each Session's Turns on its Agent, and keeps every
record in the Store. The Heartbeat tree keeps the Machine online: a tunnel to
this computer, and a Heartbeat to Cloud Connect. Each root runs with
`Runtime.start`. The engine Layer gives `Store`, `Harnesses`,
`HarnessAccounts`, `OneShotPrompt` and `Agents`. The machine Layer gives
`HeartbeatHost`.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/machine/code/engine/
  engine.ts                  the front door: finds an Instance, Sends a Message, asks a Query
  capabilities/              Agents, Store
  services/                  agents, store, harness-binaries, folders
  attachments/               saves a message's files before the front door Sends it
  engine-raw/                the engine's own Raw: turn.started, turn.ended, error
  actor-code/                root; States: Loading | Ready
  └── actor-session          in Ready, each: model.sessions; States: Idle | Running

src/machine/online/
  online.ts                  identify, online, logout; builds HeartbeatHost
  heartbeat/
    heartbeat.ts             runs actor-heartbeat until it ends
    capabilities/            HeartbeatHost
    actor-heartbeat/         root; States: Online | SigningIn | Forgotten | Stopped
```

Around the engine tree, `src/machine/code/records/` is what it keeps,
`src/machine/code/api/` is the contract and the browser client, and
`src/machine/code/code.ts` and its handlers and read feeds serve the engine
on the Machine's socket. Around the Heartbeat tree, `src/machine/online/`
holds identity, sign-in and the tunnel; `src/machine/` serves the App
Groups on its one socket, with its files where `paths/` says; and
`src/cloud/` is Cloud Connect, which it reports to.

## How it connects

Down, from the root:

```
engine Layer ─ Store, Harnesses, HarnessAccounts, OneShotPrompt, Agents ─▶ actor-code
actor-code   ─ each session id; Input: session, cwd, first ──────────────▶ actor-session
machine Layer ─ HeartbeatHost ───────────────────────────────────────────▶ actor-heartbeat
```

Up, from the leaves:

```
actor-session   ─ Worker agent, always ───────────▶ keeps the Agent in Agents
actor-session   ─ Worker turn, in Running ────────▶ appends Raw; Sends NativeId, Steered, TurnEnded
actor-session   ─ Worker cancel, while cancelling ▶ Sends TurnEnded
actor-session   ─ Worker agentTurn, in Idle ──────▶ Sends AgentTurn
actor-session   ─ Worker jobs, always ────────────▶ Sends Jobs
actor-session   ─ Worker questions, always ───────▶ Sends Questions
actor-session   ─ Worker title, while untitled ───▶ Sends Titled
actor-session   ─ Worker persist, always ─────────▶ saves the record
actor-code      ─ Worker load, in Loading ────────▶ Sends Loaded
actor-heartbeat ─ Workers tunnel, beat, signIn ───▶ Sends TunnelUp, TunnelLost, Checked, …
```

The engine's front door follows three rules. Everything the user does is a
Message to one Instance: a Project or a new Session to actor-code, a message,
cancel or Settle to a Session by its id. Everything the user reads is the
tree's state. Every question for a Session, a Fork, an Ask, a new Title, its
Agent's MCP Server Status and Context Usage, is a Query on the Session; what
the answer changes is a Message after it, such as AddSession for a Fork.

## actor-code

**Does**: holds the Projects and one Session Child per Session in them, and
saves the Projects.
**Input**: none.
**Model**: projects: every Project. sessions: each Session as it was first
handed over, with its folder and its first Prompt or null. Both are kept for
the whole life and are empty while Loading.
**States**: Loading: nothing. Ready: nothing. Loaded moves Loading to Ready.
**Messages**: Loaded: the load Worker. AddProject, RemoveProject,
StartSession, AddSession: the front door.
**Commands**: SaveProject: ends with nothing. RemoveProject: ends with nothing.
**Workers**: load: in Loading; runs the Bootstrap Sweep; Sends Loaded.
**Requires**: Store: the load Worker and both Commands.
**Provides**: none.
**Services**: none.
**Children**: sessions: in Ready, each session id; Input: the session, cwd,
the first Prompt or null.
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
- **Folders is a Service of the engine, behind the front door**, because
  picking a folder to become a Project is the engine's domain, and the API
  then talks to the Engine alone. Caveat: the engine takes `home` as an
  option.

## actor-session

**Does**: keeps one Agent of one Coding Harness in a Project's folder, and
orders its Turns. A message starts or steers a Turn.
**Input**: the stored session, cwd, the first Prompt or null.
**Model**: session: the record without status. cwd. untitled: the first
message until it has a title. jobs and refusedStops: the Background Jobs the
Agent last listed and the stops it refused, in memory only. questions and
answered: the Agent Questions the Agent last listed, and how each Answer
went until the front door reads it, in memory only.
**States**: Idle: ended. Running: turnId, prompt, steers, cancelling, queued.
Send and AgentTurn move Idle to Running. TurnEnded moves Running to Idle, or
to a new Running for a steer the Agent did not take or a message sent while
cancelling.
**Messages**: Send, Cancel, Settle, Unsettle, StopJob, Answer, AnswerRead,
Titled: the front door. TurnEnded, NativeId, Steered: the turn and cancel
Workers. AgentTurn: the agentTurn Worker. Jobs: the jobs Worker. Questions:
the questions Worker. Titled: the title Worker. JobStopFailed: the StopJob
Command. AnswerGiven: the AnswerQuestion Command.
**Commands**: StopJob: ends with JobStopFailed when the harness refuses, or
with nothing. AnswerQuestion: ends with AnswerGiven, with the harness's
reason when it refuses.
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
StopJob, AnswerQuestion, mcpStatus, contextUsage. Store: persist, turn, fork, retitle. Harnesses:
agent, fork, ask. HarnessAccounts: agent, fork, ask, title, retitle. OneShotPrompt:
title, retitle.
**Provides**: none.
**Services**: none in the tree: services/agents/ keeps each Agent, opened on
first use and kept across Turns.
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
  needs how it went, so the Session keeps each outcome in its Model, by an
  id the front door mints, until the front door has read it and Sends
  AnswerRead.
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

## actor-heartbeat

**Does**: keeps a tunnel open and Reports the Machine to Cloud Connect every
beat.
**Input**: none.
**Model**: generation, status, failures, refusals: kept across SigningIn and
Online.
**States**: Online. SigningIn. Forgotten. Stopped: reason. SignedOut moves
Online to SigningIn; SignedIn moves it back. Forgotten and Stop end it.
**Messages**: Installing, Opening, OpenFailed, TunnelUp, TunnelLost: the
tunnel Worker. Checked: the beat Worker. Reported, SignedOut, Forgotten,
Stop: the Report's answer. SignedIn: the signIn Worker.
**Commands**: none.
**Workers**: tunnel: in Online, each generation; Sends Installing, Opening,
OpenFailed, TunnelUp, TunnelLost. beat: in Online, always; Sends Checked and
the Report's answer. signIn: in SigningIn; Sends SignedIn or Stop.
**Requires**: HeartbeatHost: all three.
**Provides**: none.
**Services**: none in the tree: machine.ts builds HeartbeatHost from
tunnel/, sign-in/ and Cloud Connect's client.
**Children**: none.
**View**: none.

### Decisions

- **The tunnel is a Worker keyed by generation, not a Command**, because it
  must be stopped and restarted. A new generation is a fresh tunnel.
- **tunnel/, identity/ and sign-in/ stay Modules beside the tree, not
  services/**, because identify and logout use them outside the tree.
