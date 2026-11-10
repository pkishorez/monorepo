# Connect actor trees

Connect is two programs on one computer, each with one Kabuki tree. The
Connect CLI's tree is `ke-connect serve`: it signs its User in, and while
signed in runs one Connection: a server on its port, a tunnel to it that
reports to Connect Cloud, and one Child per Plugin that keeps that Plugin's
process running at the Release wanted. The engine tree is the `code` Plugin's,
in a process of its own: it holds the Projects and the Sessions in them, runs
each Session's Turns on its Agent, and keeps every record in the Store. The two
never import each other; the server passes Code's socket to the Plugin's
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
  actor-identity/            root; States: SigningIn | SignedIn | Ended; run.ts starts it
  ├── capabilities/          CloudAccount, Control: what it stands on; Cloud: what it Provides
  ├── services/              account, cloud: Connect Cloud's client, signed in; control: the control socket; folders, connection.json, the Sign-in
  └── actor-connection/      in SignedIn; States: Starting | Listening
      ├── server/            the public port, who may come in, and minting a Connection Key
      ├── actor-tunnel/      in Listening; States: the Connection Status, SettingUp | Ready
      │   ├── capabilities/  Tunnels
      │   └── services/      tunnels, quick-tunnel, binary, check
      └── ActorPlugin        in Listening, each: model.wanted; from @kestack/cli-platform/plugins

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

Around the CLI's tree, `src/cloud/` is Connect Cloud, which it reports to,
`src/heartbeat/` everything the two say to each other, and
`src/connection/link/` how an App reaches a Plugin through its server: the Link.
Around the engine tree, `src/connection/plugins/code/records/` is what it keeps,
`src/connection/plugins/code/api/` is the contract and the browser client, and
`src/connection/plugins/code/serve/main.ts` serves the engine on the socket the
Connection gives it, through cli-platform's `Plugin.make`, with `serve.ts` and
its handlers and read feeds.

## How it connects

Down, from the root:

```
CLI Layer        ─ CloudAccount, Tunnels, Control, Downloads ────────────────▶ actor-identity
actor-identity   ─ Provides Cloud ───────────────────────────────────────────▶ actor-connection and below
actor-identity   ─ in SignedIn; Input: id, name, folders, socketId, control, port, origins, rotateEvery ▶ actor-connection
actor-connection ─ in Listening; Input: port; Props: key ────────────────────▶ actor-tunnel
actor-connection ─ in Listening, each Plugin name; Input: name, folders, socket; Props: wanted ▶ ActorPlugin
engine Layer     ─ Store, Harnesses, HarnessAccounts, OneShotPrompt, Agents, Answers, Git ▶ actor-code
actor-code       ─ each session id; Input: session, cwd, first ──────────────▶ actor-session
```

Up, from the leaves:

```
ActorPlugin      ─ Emits Reported ────────────────▶ becomes PluginReported on actor-connection
actor-tunnel     ─ Emits Wanted ──────────────────▶ becomes Wanted on actor-connection
actor-connection ─ Emits ServerFailed ────────────▶ becomes Stop on actor-identity
actor-tunnel     ─ Worker tunnel, each generation ▶ holds the tunnel; Sends Downloading, Opening, Failed, Up, Lost
actor-tunnel     ─ Worker reportSetup, in SettingUp ▶ Requests Cloud.report; Sends Answered
actor-tunnel     ─ Worker heartbeat, in Ready ────▶ checks, Sends Checked; Requests Cloud.report; Sends Answered
actor-connection ─ Worker server, always ─────────▶ mints the first key, listens on the port; Sends Listening or ServerFailed
actor-connection ─ Worker rotateKey, in Listening ▶ Sends KeyRotated
actor-identity   ─ Cloud.report ──────────────────▶ Sends Addressed, Reported, SignedOut, Forgotten, Stop
actor-identity   ─ Worker signIn, in SigningIn ───▶ Sends SignedIn, or Stop
actor-identity   ─ Worker answerLocal, always ────▶ answers on the control socket; Sends Stop
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
signed in, is the only place that knows what a Report's answer means for the
login, and answers on the control socket.
**Input**: the Connection's name on this computer, its folders, its control
socket and what names its Plugins' sockets, the port, the origins let in, and
how long a Connection Key lasts, an hour unless given.
**Model**: the Input. url: the tunnel's address, as the last Report said it,
null while there is none. refusals: Sign-ins refused in a row since a Report was
last taken.
**States**: SigningIn: who, null the first time. SignedIn: who, the Connection's
id. Ended: why, Forgotten or Stopped with a reason, null when asked to stop.
SignedIn moves SigningIn to SignedIn; SignedOut moves it back, keeping who.
Forgotten and Stop end it.
**Messages**: SignedIn: the signIn Worker. Addressed, Reported, SignedOut,
Forgotten: Cloud's report, from what it was given and what Connect Cloud
answered. Stop: the same, the signIn and answerLocal Workers, and the
Connection's ServerFailed.
**Commands**: none.
**Workers**: signIn: in SigningIn; signs in for the first time, or after waiting
the back-off signs in again; Sends SignedIn or Stop. answerLocal: always; answers
`status` and `stop` on the control socket `serve` holds.
**Requires**: CloudAccount: signIn, Cloud's report. Control: answerLocal.
**Provides**: Cloud: `every`, and `report`, which takes the status and the
Connection Key, answers with the Releases to run or null, and Sends what any
other answer means.
**Services**: account: signing in, signing in again, and a Report, on Connect
Cloud's client. control: `hold`, which `serve` takes the control socket with.
**Children**: connection: in SignedIn; Input: who it is and where it runs; its
ServerFailed becomes Stop.
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

## actor-connection

**Does**: keeps one Connection running while its User is signed in: its public
port and Connection Key, its tunnel, and its Plugins.
**Input**: the Connection's id and name, its folders, its control socket and what
names its Plugins' sockets, the port, the origins let in, and how long a
Connection Key lasts.
**Model**: the Input. wanted: the Release of each Plugin to run: empty at first,
then each of Connect Cloud's answers merged over it. plugins: each Plugin State
as last reported.
**States**: Starting: the port is not open yet. Listening: port, key: the port it
got, and the Connection Key now. Listening moves Starting to Listening; KeyRotated
changes the key.
**Messages**: Listening, ServerFailed: the server Worker. KeyRotated: the rotateKey
Worker. Wanted: the tunnel's Emit. PluginReported: each Plugin's Emit.
**Emits**: ServerFailed: reason; the port cannot be opened.
**Commands**: none.
**Workers**: server: always; mints the first Connection Key, listens on the port,
checks the key, passes `/<plugin>/<sha256>/rpc` to each Plugin's socket as `/rpc`
while the Plugin is Running that hash, and closes a WebSocket for any other with
4409, or answers 409, naming the hash it runs; a wrong key closes a WebSocket with
4401, or answers 401; any other path is 404. rotateKey: in Listening; mints a new
key every `rotateEvery`.
**Requires**: none of its own.
**Provides**: none.
**Services**: server/: the server, its guard, and minting a key.
**Children**: tunnel: in Listening; Input: the port; Props: the Connection Key; its
Wanted becomes Wanted. plugins: in Listening, each name in wanted; ActorPlugin from
`@kestack/cli-platform/plugins`; Input: its name, its folders inside the
Connection's, its socket; Props: the Release wanted; its Reported becomes
PluginReported, with its name.
**View**: none.

### Decisions

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

## actor-tunnel

**Does**: holds the door to the street, and keeps Connect Cloud told where it
stands.
**Input**: port: the server's.
**Props**: key: the Connection Key now, which every Report carries.
**Model**: port. generation: which tunnel this is. failures: failed Tunnel Checks
in a row.
**States**: the Connection Status, the very value a Report carries. SettingUp: step,
one of Downloading: elapsed, received. Opening. Failed: at, problem. Ready: url,
check, one of Unchecked. Reachable: at. Unreachable: at, problem. Up moves SettingUp
to Ready. Lost, or a third failed check in a row, starts a new generation at
SettingUp, Opening.
**Messages**: Downloading, Opening, Failed, Up, Lost: the tunnel Worker. Checked: the
heartbeat Worker. Each carries its generation, so a word from a tunnel already
replaced is dropped. Answered: reportSetup and heartbeat, when Connect Cloud took a
Report.
**Emits**: Wanted: releases; what Connect Cloud answered.
**Commands**: none.
**Workers**: tunnel: each generation; gets cloudflared, saying Downloading after half
a second and then every five seconds, opens the tunnel and holds it until it closes,
or waits five seconds when it could not open; Sends Lost either way. reportSetup: in
SettingUp; Reports at once, on each change of step or key, and every `Cloud.every`
since the last. heartbeat: in Ready; Reports at once with the address and on each
change of key, and every `Cloud.every` checks the tunnel, Sends Checked, and Reports.
**Requires**: Tunnels: tunnel, heartbeat. Cloud: reportSetup, heartbeat.
**Provides**: none.
**Services**: tunnels, quick-tunnel, binary and check, which run.ts makes Tunnels from.
**Children**: none.
**View**: none.

### Decisions

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
