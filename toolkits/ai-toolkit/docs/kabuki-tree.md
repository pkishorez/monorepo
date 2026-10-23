# ai-toolkit actor trees

ai-toolkit is one server on one computer. It has three Kabuki trees that
never touch, all under `src/kabuki/`. The engine tree runs Projects, Sessions
and Turns for the user and keeps every record in the Store. The machine tree
keeps the Machine online: a tunnel to this server, and a Heartbeat to the
Machines Backend. The speech tree keeps the Speech to Text model on this
computer: it downloads it, deletes it, and turns audio into text with it.
Every root runs with `Runtime.start`. The engine Layer gives `Store`,
`Harnesses`, `Titler`, `HarnessBinaries` and `Desks`. The machine Layer gives
`HeartbeatHost`. The speech Layer gives `SpeechHost`.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/kabuki/engine/
  engine.ts                  the front door: finds an actor, posts a Message, reads the tree
  capabilities/              Desks
  services/                  desks, harness-binaries, folders
  prompt/  engine-raw/       Modules the front door, the API and the Actors share
  actor-projects/            root; States: Loading | Ready
  └── actor-project          each: model.projects
      └── actor-session      each: model.sessions; States: Idle | Running

src/kabuki/machine/
  machine.ts                 identify, online, logout; builds HeartbeatHost
  heartbeat.ts               runs actor-heartbeat until it ends
  capabilities/              HeartbeatHost
  actor-heartbeat/           root; States: Online | SigningIn | Forgotten | Stopped
  backend/                   the Machines Backend it reports to: contract, client, serve

src/kabuki/speech/
  speech.ts                  the front door: enable, disable, watch, transcribe; builds SpeechHost
  capabilities/              SpeechHost
  actor-speech-model/        root; States: Loading | Off | Downloading | Ready | Failed
```

Around the trees, `src/services/` holds what the server's Layer gives them:
`harness/` (the contract, the wire shapes, Claude, Codex and the fake),
`records/` (Raw, the entities, their projection to Messages, and the Store)
and `speech/` (the SpeechToText contract, sherpa-onnx with Parakeet, and the
fake).
`src/api/` is the contract, its handlers and the browser client, which
opens one socket per Machine and syncs each Machine's `Ai` Instance over
its own. `src/cli/` assembles it all.

## How it connects

Down, from the root:

```
engine Layer ─ Store, Harnesses, Titler, HarnessBinaries, Desks ─▶ actor-projects
actor-projects ─ each id; Input: project, sessions ──────────────▶ actor-project
actor-project  ─ each id; Input: session, first, cwd ────────────▶ actor-session
machine Layer  ─ HeartbeatHost ──────────────────────────────────▶ actor-heartbeat
speech Layer   ─ SpeechHost ─────────────────────────────────────▶ actor-speech-model
```

Up, from the leaves:

```
actor-session   ─ Worker desk, always ────────────▶ puts its Desk out in Desks
actor-session   ─ Worker turn, in Running ────────▶ Sends NativeId, Steered, TurnEnded
actor-session   ─ Worker cancel, while cancelling ▶ Sends TurnEnded
actor-session   ─ Worker agentTurn, in Idle ──────▶ Sends AgentTurn
actor-session   ─ Worker jobs, always ────────────▶ Sends Jobs
actor-session   ─ Worker title, while untitled ───▶ Sends Titled
actor-session   ─ Worker persist, always ─────────▶ saves the record
actor-projects  ─ Worker load, in Loading ────────▶ Sends Loaded
actor-heartbeat ─ Workers tunnel, beat, signIn ───▶ Sends TunnelUp, TunnelLost, Checked, …
actor-speech-model ─ Worker load, in Loading ─────▶ Sends Loaded
actor-speech-model ─ Worker remove, in Off ───────▶ deletes the model and the wish
actor-speech-model ─ Worker download, in Downloading ▶ Sends Fetched, Downloaded, DownloadFailed
```

The engine's front door follows three rules. Everything the user does is a
Message to one actor. Everything the user reads is the tree's state. A
question for a Session's agent is asked at the Session's Desk. The speech
front door follows the first two; a transcription is a Query of the speech
model.

## actor-projects

**Does**: holds one Project Child per Project and saves the list.
**Input**: none.
**Model**: projects: kept for the whole life; empty while Loading.
**States**: Loading: nothing. Ready: nothing. Loaded moves Loading to Ready.
**Messages**: Loaded: the load Worker. AddProject, RemoveProject: the front door.
**Commands**: SaveProject: ends with nothing. RemoveProject: ends with nothing.
**Workers**: load: in Loading; runs the Bootstrap Sweep; Sends Loaded.
**Requires**: Store: the load Worker and both Commands.
**Provides**: none.
**Services**: none.
**Children**: projects: in Ready, each project id; Input: the project and its sessions.
**View**: none.

### Decisions

- **The root loads itself in a Loading State, not from Input**, because the
  Bootstrap Sweep is the root's own job. Caveat: the front door waits for
  Ready before it opens.
- **Saving is a Command, not a Worker**, because nothing is shown while it
  saves and nothing stops it.
- **The root is named Projects, not Host**, because Host is a Kabuki glossary
  word for what the Runtime holds.

## actor-project

**Does**: holds one Session Child per Session of one folder.
**Input**: the project record and its started Sessions.
**Model**: the Input: kept for the whole life.
**States**: none.
**Messages**: StartSession: the front door. AddSession: the front door, for a Fork.
**Commands**: none.
**Workers**: none.
**Requires**: none.
**Provides**: none.
**Services**: none.
**Children**: sessions: each session id; Input: the session, its first Prompt or null, cwd.
**View**: none.

### Decisions

- **cwd travels as Input, not as a Capability**, because only the direct Child
  reads it.

## actor-session

**Does**: runs one conversation with one Coding Harness. A message starts or
steers a Turn.
**Input**: the stored session, cwd, the first Prompt or null.
**Model**: session: the record without status. cwd. untitled: the first message
until the Titler answers. jobs: the Background Jobs the agent last listed, in
memory only.
**States**: Idle: ended. Running: turnId, prompt, steers, cancelling, queued.
Send and AgentTurn move Idle to Running. TurnEnded moves Running to Idle, or to
a new Running.
**Messages**: Send, Cancel, Settle, Unsettle: the front door. TurnEnded,
NativeId, Steered: the turn and cancel Workers. AgentTurn: the agentTurn
Worker. Jobs: the jobs Worker. Titled: the title Worker, or the Desk.
**Commands**: none.
**Workers**: desk: always; opens the agent on first use and puts the Desk out.
jobs: always; Sends Jobs. persist: always; saves each changed record. title:
while untitled; Sends Titled. agentTurn: in Idle; Sends AgentTurn. turn: in
Running, each turnId; writes Raw, Sends NativeId, Steered, TurnEnded. cancel:
in Running, while cancelling; Sends TurnEnded after the grace period.
**Requires**: Desks: desk, jobs, agentTurn, turn, cancel. Store: persist, turn,
the Desk. Harnesses, HarnessBinaries: desk, the Desk. Titler: title, the Desk.
**Provides**: none.
**Services**: agent: the harness process, opened on first use, kept across Turns.
**Children**: none.
**View**: none.

### Decisions

- **The status is the State, not a Model field**, because Running holds data
  Idle does not.
- **The Turn is a Worker keyed by turnId, not a Child**, because a Session runs
  exactly one Turn and the Turn has no States, View or Children of its own. A
  new turnId is a fresh Worker. Caveat: the Worker reads the Turn's steers and
  cancelling from the Session's State, and ignores them once the State has
  moved on.
- **The agent is shared through the Desk, not a Provide**, because a Provide
  reaches only Children and the Session has none. Caveat: a Worker waits for
  the Desk to be out, which every Session does as it starts.
- **A Fork, a new Title and an Ask are answered at the Desk, not by Messages**,
  because the caller needs the answer, and a Message answers nothing. Caveat:
  the Desk is the one place outside the tree that holds a Session's closures.
- **persist is a Worker, not a Command**, because it follows every change in
  order.
- **prompt/ and engine-raw/ sit beside the root, not in the Session's folder**,
  because the front door saves a message's files before it Sends, and the API
  and the Bootstrap Sweep read the engine's own records. A Module two places
  use sits at the lowest folder that holds both.

## actor-heartbeat

**Does**: keeps a tunnel open and Reports the Machine to the Backend every beat.
**Input**: none.
**Model**: generation, url, failures, tunnel, refusals: kept across SigningIn
and Online.
**States**: Online. SigningIn. Forgotten. Stopped: reason. SignedOut moves
Online to SigningIn; SignedIn moves it back. Forgotten and Stop end it.
**Messages**: TunnelUp, TunnelLost, Checked: the tunnel and beat Workers.
Reported, SignedOut, Forgotten, Stop: the Report's answer. SignedIn: the
signIn Worker.
**Commands**: none.
**Workers**: tunnel: in Online, each generation; Sends TunnelUp, TunnelLost.
beat: in Online, always; Sends Checked and the Report's answer. signIn: in
SigningIn; Sends SignedIn or Stop.
**Requires**: HeartbeatHost: all three.
**Provides**: none.
**Services**: none in the tree: machine.ts builds HeartbeatHost from tunnel/,
sign-in/ and machines/client.
**Children**: none.
**View**: none.

### Decisions

- **The tunnel is a Worker keyed by generation, not a Command**, because it
  must be stopped and restarted. A new generation is a fresh tunnel.
- **tunnel/, identity/ and sign-in/ stay Modules beside the tree, not
  services/**, because identify and logout use them outside the tree.
- **The harness contract and the Claude and Codex implementations live in
  src/services/harness, not under the engine**, because the API reads the
  contract too and the CLI, not the engine, picks the harnesses. The contract
  is a nested Module of its own, so the implementations beside it never import
  upward.
- **Folders is a Service of the engine, behind the front door**, because
  picking a folder to become a Project is the engine's domain, and the API
  then talks to the Engine alone. Caveat: the engine takes `home` as an option.

## actor-speech-model

**Does**: keeps the Speech to Text model on disk while it is switched on, and
transcribes with it.
**Input**: none.
**Model**: none.
**States**: Loading: nothing. Off: nothing. Downloading: done, total: the
bytes of the model on disk, of the total once the server says it. Ready:
nothing. Failed: reason. Loaded moves Loading to Off, Downloading or Ready.
Enable moves Off and Failed to Downloading. Downloaded moves Downloading to
Ready; DownloadFailed moves it to Failed. Disable moves every State to Off.
**Messages**: Enable, Disable: the front door. Loaded: the load Worker.
Fetched, Downloaded, DownloadFailed: the download Worker.
**Commands**: none.
**Workers**: load: in Loading; reads the wish and the files; Sends Loaded.
remove: in Off; forgets the loaded model and deletes the folder. download:
in Downloading; keeps the wish, fetches the model; Sends Fetched about 200
times, then Downloaded or DownloadFailed.
**Requires**: SpeechHost: all three Workers and the transcribe Query.
**Provides**: none.
**Services**: none in the tree: speech.ts builds SpeechHost from SpeechToText
and the data folder.
**Children**: none.
**View**: none.

### Decisions

- **Speech to Text is a third tree, not a Child in the engine or machine
  tree**, because it knows nothing of Sessions or Coding Harnesses, and the
  machine tree runs only while the Machine is online and ends when it is
  Forgotten, while Speech to Text answers whenever the server listens.
  Caveat: the server Layer starts two Runtimes, the engine's and this one.
- **The State is what is on disk, not a Model field beside a status**,
  because each State holds different data and owns the Worker that makes the
  disk match it: Off deletes, Downloading fetches. Caveat: Off deletes the
  folder each time it starts, at every start of a Machine with Speech to
  Text off too; there is nothing to delete then.
- **Deleting is a Worker of Off, not a Command of Disable**, because a
  restart with the wish gone must find nothing on disk, and a Worker starts
  from the State alone. Caveat: SpeechHost makes the delete wait for a fetch
  that Disable stopped to let go of the folder.
- **The root loads itself in a Loading State, not from Input**, as
  actor-projects does. Caveat: the front door waits for the State after
  Loading before it opens.
- **A transcription is a Query of Ready, not a Message**, because the caller
  needs the text, and a Query is askable only while Ready. Leaving Ready
  interrupts it. Caveat: the front door answers SpeechToTextNotReady itself
  in every other State.
- **The loaded model is kept in SpeechHost, not by a Worker in Ready**,
  because a Query cannot reach what a Worker holds, and loading on the first
  transcription is the host's job. Caveat: remove forgets it, so it lives
  as long as the files do, not as long as Ready.
- **The SpeechToText contract and sherpa-onnx live in src/services/speech,
  not in the tree**, because the server's Layer, not the tree, picks the
  model, as the CLI picks the harnesses, and tests give the fake.
