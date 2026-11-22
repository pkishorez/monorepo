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

**Trace Summary**:
One row describing a Trace as a whole: its identity, root operation, service,
timing, span count, and error count. It is what a listing of recent Traces
returns.
_Avoid_: Trace header, trace row.
