# DevTools — Context

DevTools is the unified local developer experience for the tools in this
repository. It gives developers one place to access independent tools without
merging their domains.

## Language

**DevTools**:
The umbrella through which developers access all local development tools.
_Avoid_: Tool suite, admin panel.

**Tool**:
A self-contained developer capability presented through DevTools: Lotel,
Monoverse and Kabuki. Each is one Actor, its Tool Actor, with its own RPC
contract and Server half beside it in one folder.

**Tool Actor**:
A Tool's whole browser side as one plain Kabuki Actor: it starts from its
Input, draws everything below it, and knows nothing of URLs or of the app
around it. What it needs from the DevTools Server comes as Capabilities its
host provides, so any app can mount it alone or beside the others.
_Avoid_: Tool page, Tool component, widget.

**Tool page**:
Where the DevTools app places one Tool Actor in the URL: `/lotel`,
`/monoverse`, `/kabuki`. It hands the address to the Tool Actor, as its
Input at the start and as Props after, which the Tool Actor follows without
starting over, and writes what the Tool Actor Emits back into the address,
such as `?session=` and `?project=`. It keeps no state of its own.
_Avoid_: route, Tool route.

**Server half**:
What a Tool adds to the DevTools Server: its routes, under its own paths, with
its handlers and stores. The DevTools Server is the Server halves of every
Tool put together, plus the app.
_Avoid_: backend, handlers.

**Agent**:
The DevTools piece that asks Claude Code about a folder, with read-only tools
and, when asked with `mcp`, DevTools' own MCP tools, for any Tool: a question in, an answer out, as text or as data shaped by a
JSON Schema. It is not a Tool: it has no page and knows nothing of what a
Tool asks about. Its Server half runs Claude Code; any Tool Actor Requires its
client.
_Avoid_: AI, assistant, chat.

**Thread**:
One conversation with the Agent about one folder: its questions, answers,
activity lines and each run's status, in order, on one Claude Code session.
Kept in the DevTools Server's memory, so a restart drops every Thread.
_Avoid_: Chat, conversation, session (on its own).

**Tool Scope**:
Whether a Tool works with repository-wide information or information from one
Project.
_Avoid_: Project scope when the Tool is repository-wide.

**Project**:
A source folder opened for analysis: a Monorepo or Single Package selected in
Monoverse.
_Avoid_: Workspace when referring to one selected source folder.

**Worktree**:
One git checkout of the repository a Project lives in. The primary checkout
and every linked checkout are Worktrees alike. A branch one of them has
checked out is read from its folder, uncommitted work and all.
_Avoid_: Checkout, branch folder, clone.

**Project registry**:
The Monorepos and Single Packages a developer has added to Monoverse, kept by
the DevTools server and shared by every browser on the machine. Each entry
names one folder, called by its `package.json` name; the branch being read is
not part of the entry.
_Avoid_: Saved projects, recent projects, project list.

**Monoverse**:
The DevTools Tool and domain for understanding one Monorepo or Single Package
through its folder tree: its Packages, the imports between its folders, the
one rule they keep, and their changes. See the
[Monoverse context](./docs/monoverse.md).
_Avoid_: Monorepo Tool, Workspace Tool.

**Lotel**:
The DevTools Tool and domain for receiving and inspecting local OpenTelemetry
data. See the [Lotel context](./docs/lotel.md).
_Avoid_: Telemetry Tool, OTel Tool.

**DevTools URL**:
The canonical `127.0.0.1` loopback address through which a developer or
instrumented application accesses one running DevTools instance.

**Ingestion**:
The receipt of Span Records and Log Records from an instrumented application.
Metrics are outside the Telemetry Tool's scope.

**devtools**:
The command-line program through which developers start the DevTools Server.
It is the binary of the `@kestack/devtools` package; DevTools remains the
name of what it hosts.
_Avoid_: DevTools CLI, kstack.

**DevTools Server**:
One running DevTools instance, reachable at a DevTools URL, that serves the
app and the Server half of every Tool, Ingestion included.
_Avoid_: Dev server, daemon.

**Kabuki Session**:
One running Kabuki app connected to a DevTools Server under a unique name,
kept in memory while its socket is open. Defined in the
[DevTools Kabuki context](../devtools-kabuki/CONTEXT.md).
_Avoid_: session (on its own), tab, connection.

**Story**:
The Kabuki Tool's second view of an open Kabuki Session, beside the
Inspector: a question to the Agent about the app's code in a Worktree of
its Project, both picked once and remembered per app, answered as Beats and
played on the root's Blueprint drawn as a tree of cards, one Beat at a time.
Whatever the question, the answer is a story that starts wide and builds
up. Its Threads are the Agent's; it keeps only the Project, the Worktree and
the Thread last open.
_Avoid_: tour, walkthrough, explanation.

**Chat**:
The Kabuki Tool's chat beside the Inspector, in the same window as Story's: the same Project, Worktree and Thread, picked once and remembered per app, starting from Story's, and the same turns and composer. Its questions go to the Agent asked with `mcp`, with no JSON Schema, so Claude Code answers in words and reaches the Kabuki Session in view through DevTools' MCP tools: it looks at it, Sends Messages, Time Travels and runs Fakes' controls. Its Threads are only its own. Beside it, World, when the app has Fakes. It is DevTools' alone: the Inspector in the page has no Chat.
_Avoid_: assistant, copilot, AI panel.

**Beat**:
One step of a Story: one to three sentences about what is on screen, and
the whole picture they speak to, never a change from the Beat before: the
actor the camera centres on, every lit card with exactly the Refs lit on
it, and the links lit between actors with their labels. The rest of a lit
card stays in its place, dimmed; every other card is quiet, its name only.
What a Beat names that the Blueprint does not have is shown as not found;
the rest of it still shows.
_Avoid_: step (that is Kabuki's), slide, stop.

**Card**:
How the Story draws one actor's Plan, always in the same shape, by Kabuki's
levels: its description, its model keys, Always (what holds at the top
level: the Workers, Messages and Children there, then its Emits, Requires,
Provides, Queries, Input and Props), then one row per State, which expands
to that State's data keys, Workers, Messages and Children. Keys and
payloads are named, never valued.
_Avoid_: node, box.

**Ref**:
One thing a Beat lights on a card, from a closed grammar built from the
Plan: `description`; `model` or `model.<key>`; `input`, `props` and their
keys; `state:<Tag>` and `state:<Tag>.<key>`; `worker:<name>`,
`message:<Tag>`, `message:<Tag>.<key>` and `child:<slot>`, each found at
the level it belongs to (written `state:<Tag>/…` when a name is at several);
`emits:<Tag>`, `requires`, `provides` and `queries`. Lighting a Ref inside a
State expands that State.
_Avoid_: part, section, field.

**Story mode**:
How the Story's canvas is while a story plays or is stepped: the current
Beat decides every card, and nothing on a card can be opened or clicked.
Panning and zooming keep it; the next Beat pans to centre its actor, at the
zoom the person chose.
_Avoid_: playback, presentation.

**Explore mode**:
How the Story's canvas is once a card is touched: it starts from the
current Beat's picture, and on any card the States expand and collapse and
each row lights by hand, each row able to add its Ref to the next question. "Back to
story", a Beat in the chat, Back or Next return to Story mode.
_Avoid_: free mode, manual mode.

**Trace Summary**:
One row describing a Trace as a whole: its identity, root operation, service,
timing, span count, and error count. It is what a listing of recent Traces
returns.
_Avoid_: Trace header, trace row.
