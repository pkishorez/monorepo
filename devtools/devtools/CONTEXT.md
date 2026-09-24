# DevTools — Context

DevTools is the unified local developer experience for the tools in this
repository. It gives developers one place to access independent tools without
merging their domains.

## Language

**DevTools**:
The umbrella through which developers access all local development tools.
_Avoid_: Tool suite, admin panel.

**Tool**:
A self-contained developer capability presented through DevTools. Lotel, Flow,
Laymos, and Monoverse are Tools.

**Tool family**:
The purpose a Tool serves: Lotel and Flow are telemetry Tools; Laymos and
Monoverse are project-understanding Tools. Tools in one family link to each
other; families do not share domains.

**Tool Scope**:
Whether a Tool works with repository-wide information or information from one
Project.
_Avoid_: Project scope when the Tool is repository-wide.

**Project**:
A source folder selected for analysis by a Project-scoped Tool.
_Avoid_: Workspace when referring to one selected source folder.

**Worktree**:
One git checkout of the repository a Project lives in. The primary checkout
and every linked checkout are Worktrees alike; a Project belongs to exactly one.
_Avoid_: Checkout, branch folder, clone.

**Worktree sibling**:
The Project at the same repository-relative path under another Worktree of the
same repository. A sibling may be absent when that Worktree does not contain
the path. Switching Worktree means selecting a Worktree sibling; the Project
stays identified by its own folder.
_Avoid_: Worktree variant, alternate project, mirror.

**Project registry**:
The list of Projects a developer has registered with DevTools, kept by the
DevTools server and shared by every browser on the machine. Each entry belongs
to one Tool and names one folder; the Worktree currently being analysed is not
part of the entry.
_Avoid_: Saved projects, recent projects, project list.

**Laymos**:
The DevTools Tool and domain for describing and analyzing the architecture of a
Project.
_Avoid_: Architecture Tool.

**Monoverse**:
The DevTools Tool and domain for understanding one pnpm monorepo as a whole:
its packages, their dependencies, and their changes. See the
[Monoverse context](./docs/monoverse.md).
_Avoid_: Monorepo Tool, Workspace Tool.

**Lotel**:
The DevTools Tool and domain for receiving and inspecting local OpenTelemetry
data. See the [Lotel context](../lotel/CONTEXT.md).
_Avoid_: Telemetry Tool, OTel Tool.

**Flow**:
The DevTools Tool for receiving Flow Entries and inspecting Journals as swim
lanes. See the [Flow context](../flow/CONTEXT.md).
_Avoid_: Flows tab, Swim lane Tool.

**Flow Store**:
The DevTools persistence of Flow Entries. It shares the one DevTools database
with Lotel's Telemetry Store but keeps its own table.

**DevTools URL**:
The canonical `127.0.0.1` loopback address through which a developer or
instrumented application accesses one running DevTools instance.

**Ingestion**:
The receipt of Span Records and Log Records from an instrumented application.
Metrics are outside the Telemetry Tool's scope.

**devtools**:
The command-line program through which developers start the DevTools Server
and run Client Commands. It is the binary of the `@pkishorez/devtools`
package; DevTools remains the name of what it hosts.
_Avoid_: DevTools CLI, kstack.

**DevTools Server**:
One running DevTools instance, reachable at a DevTools URL, that serves the UI,
RPC, and Ingestion.
_Avoid_: Dev server, daemon.

**Client Command**:
A `devtools` subcommand that serves nothing itself and reads Lotel telemetry
from a DevTools Server. Client Commands cover Traces and Flows only; Laymos is
reached through its own CLI.
_Avoid_: CLI command, query command.

**Trace Summary**:
One row describing a Trace as a whole: its identity, root operation, service,
timing, span count, and error count. It is what a listing of recent Traces
returns.
_Avoid_: Trace header, trace row.
