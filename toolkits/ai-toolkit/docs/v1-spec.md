# ai-toolkit v1: one engine, one app

ai-toolkit is a local, long-running server that runs Claude Code and Codex
sessions in project folders. Any app talks to it over one WebSocket RPC API.
`apps/code` (code.kishore.computer) is the first such app. Local only, no auth.

That was v1. Since root ADR 0011, ai-toolkit runs the Coding Harnesses and
nothing more: the stored records, the engine and the API below are now the
`code` App Group of [`@kestack/connect`](../../../apps/connect/README.md),
which keeps them in its Store and serves them on its Machine's socket. Raw,
Message and the projection still hold here as written.

## The mental model

Two records, one rule.

- **Raw**: every whole thing Claude or Codex emits, stored as it arrived.
  Never sent to a client.
- **Message**: the projected form a client reads. Never stored.

**The rule: one Raw record projects to zero or one Message, with the same id.**
`project(raw) -> Message | null` is a pure function of one Raw record. There is
no folding and no state between records. A tool result is its own Message
that points back to its tool call; the client pairs them.

Consequences:

- Sync cursor = the newest Raw seen. "Give me what changed" = Raw newer than
  the cursor, projected, nulls dropped. Each Message carries its Raw's `_u`.
- Changing `project` changes every Message at once; nothing migrates.
- A Raw record the projection does not understand yet projects to `null`
  and still sits in Raw.

### Raw

```
Raw {
  id         ULID minted by the server when written (sorts by time)
  sessionId
  turnId
  harness    'claude' | 'codex' | 'engine'
  kind       the harness's own name for it (Claude message type, Codex method)
  payload    unknown: exactly what the harness emitted
  at         epoch ms
}
```

Only whole records: a whole assistant message, a whole user message, a tool
use, a tool result, a turn result. Never token deltas. The engine writes its
own Raw (`harness: 'engine'`): `turn.started` (with the user's text and
whether it steered), `turn.ended` (cancelled / failed when the harness could
not say so itself).

### Message (the unified projection)

```
Message {
  id          = Raw id
  sessionId, turnId, at
  agentId     null for the main agent; otherwise the id of the toolCall part
              that spawned this subagent. Subagents of subagents follow the
              same rule, so the tree is: agentId -> toolCall -> its agentId …
  role        'user' | 'assistant' | 'tool' | 'system'
  parts       Part[]
}

Part =
  | { type: 'text', text }
  | { type: 'reasoning', text }
  | { type: 'toolCall', id, tool: ToolKind, name, title, input }
  | { type: 'toolResult', toolCallId, output, truncated, isError }
  | { type: 'turnStarted', text, steered }      // engine
  | { type: 'turnEnded', status, usage?, error? } // status: done|failed|cancelled
  | { type: 'usage', usage }                    // one model call, as reported
  | { type: 'error', message }
  | { type: 'claude.<x>', … } | { type: 'codex.<x>', … } // agent-only parts
  | { type: 'other', label }                    // understood but not modelled

ToolKind = 'read' | 'write' | 'edit' | 'delete' | 'bash' | 'search' | 'web'
         | 'subagent' | 'todo' | 'mcp' | 'other'

Usage = { inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, costUsd? }
```

A toolCall whose tool is `subagent` is a subagent: its children are the
Messages whose `agentId` equals that toolCall's `id`. A toolCall without a
matching toolResult is running. Tool output is trimmed in the projection
(`truncated: true`); Raw keeps all of it.

The Message schema is one ESchema. Clients keep Messages in memory only (the
server is local and fast), so a projection change never leaves a stale copy.

## Records the engine owns (stored)

Kept by Connect's `code` App Group, in its Store.

```
Project { id, path, name, createdAt }            name = folder name
Session { id, projectId, harness, model, settings, title, status, nativeId?,
          createdAt }   status: idle | running
```

## Harnesses

```
interface Harness {
  name: 'claude' | 'codex'
  settings: Setting[]        // agent-specific settings, each with a default
  open(config: { cwd, model, settings, nativeId? }) -> Agent
  project(raw) -> Message | null
  availableModels?: Effect<{ id, name?, isDefault? }[]>  // what this login runs
}

interface Agent {
  nativeId                   // to resume after a restart
  turn(text) -> Stream<{ kind, payload }>   // ends when the agent is idle
  steer(text) -> Effect      // a message while a turn runs; same turn
  cancel -> Effect
}
```

- Claude: Agent SDK in streaming-input mode (steer = push the next user
  message). `permissionMode: 'bypassPermissions'`. AskUserQuestion is an
  Agent Question: `canUseTool` holds it until the user answers or declines.
  Settings: effort, permissionMode. Subagent output carries
  `parent_tool_use_id` -> `agentId`.
- Codex: `codex app-server` JSON-RPC. Sandbox `danger-full-access`, approval
  `never`. Steer with `turn/steer` if the server supports it; otherwise cancel
  and send again. `request_user_input`, which the app-server is started to
  allow outside Plan mode, is an Agent Question, recorded as `question.asked`
  and `question.answered`; any other request for user input is answered
  automatically: declined, continue. Settings: reasoningEffort, sandbox.
- Both: whole items only (Claude: assistant / user / result / system;
  Codex: `item/started` for tool-like items, `item/completed`, `turn/completed`,
  token usage).

Session titles: after the first user message, Connect asks a One-shot Prompt
(`codexOneShot`: Codex with model
`gpt-6-luna`, or the account's newest luna model) for a short title, written to the Session. Failure leaves the first
line of the message as the title.

## Engine (Kabuki, server-side, no drawing)

Now Connect's: `actor-code` -> `actor-session` (each), drawn in
[Connect's kabuki-tree.md](../../../apps/connect/docs/kabuki-tree.md). In v1:
Host -> Project (each) -> Session (each) -> Turn (while running).

- `sendMessage` to an idle Session starts a Turn: writes `turn.started` Raw,
  runs `turn(text)`, writes each output as Raw, marks the Session idle when
  the stream ends. Sent while running: `steer`, plus a `turn.started` Raw with
  `steered: true` on the same turn.
- `cancel` interrupts the Turn and writes `turn.ended { cancelled }`.
- On start, every Session still `running` gets `turn.ended { cancelled }` and
  goes idle. The next message resumes the agent by `nativeId`.

## API (rpc-toolkit WebSocket, one group)

Now Connect's `CodeApi`, from `@kestack/connect/code`.

Commands: `harnesses`, `models { harness }`, `addProject { path }`,
`removeProject { id }`, `startSession { projectId, harness, model, settings, text }`,
`send { sessionId, text }` (starts or steers), `cancel { sessionId }`.

Feeds (streams, replay after a cursor, then live):
`projects { after }`, `sessions { after }`, `messages { sessionId, after }`.

`models` lists what each harness's login can run (Codex's `model/list`,
Claude Code's `supportedModels()`, asked at most every few minutes), filled
in with names and release dates from models.dev, newest first. When the
login cannot be asked, it lists the models.dev models the harness accepts.
`harnesses` gives the login's default model when it names one.

Reconnect: the client reconnects with backoff and reopens every feed from
its cursor, so nothing is missed or duplicated. Commands sent while
disconnected wait for the connection.

## Not in v1

Token streaming, questions and approvals, auth, deployment, editing,
importing existing sessions, sync priority between feeds.

Forking came after v1, without breaking the rule above: a Fork stores only
`forkedFrom: { sessionId, turnId }` and none of the original's Raw. Its
transcript is the original's Messages up to that Turn's `turnEnded`, then
its own (ADR 0011, and ADR 0014, now Connect's ADR 0002).
