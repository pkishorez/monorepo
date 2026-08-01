# whatever/code — Context

Glossary for the `@pkishorez/code` package. Definitions only — no
implementation details, no specs. When a term here conflicts with how the code
or the team talks, fix it here.

## Terms

### Thread

A durable conversation with a coding harness that belongs to exactly one
Machine and is anchored to a Thread Working Directory. Its location metadata
is derived by that Machine when the Thread is created and does not prescribe how
Threads are grouped. A Thread is created atomically with its first Run and is
never empty. It has at most one running Run at a time.

### Thread ID

The stable identifier of a Thread, independent of the coding harness used to
run it.

### Coding Harness

The `_tag`-discriminated coding-agent integration selected when a Thread is
created. Version 1 supports Codex and Claude Code. A Thread remains bound to the
same variant for its lifetime.

### Harness Session ID

The Coding Harness's native identifier for the agent state associated with a
Thread. It is absent until a Run successfully establishes the harness session
and cannot change once established.

### Run

One execution belonging to exactly one Thread. It references that Thread by its
Thread ID and retains a complete, immutable snapshot of the harness
configuration used for that execution: the selected model and that harness's
per-call model options. It records its lifecycle status and any terminal
details. It continues independently of stream consumers until reaching a
terminal status. An interrupted Run is terminal.

### Persisted Run Configuration

The stable, versioned subset of coding-harness configuration retained on a Run.
It is defined by handcrafted domain schemas and contains only options this
system supports. It does not inherit the full current configuration surface of
an external harness package.

### Run Status

The lifecycle state of a Run: `running`, `completed`, `failed`, or
`interrupted`. An interrupted Run carries reason details that distinguish why
it ended.

### Message

A completed, immutable entry in a Thread's ordered transcript. It records the
Run ID that originated it and retains the corresponding TanStack AI `UIMessage`
payload.

### Message ID

The stable identifier assigned to a Message by this system, independent of the
message identifier contained in its TanStack AI payload.

### Machine

The environment in which one CLI server runs and Threads operate. It has a
stable Machine ID; its user-assigned name and hostname are descriptive metadata.

### Machine ID

The stable identifier by which Threads refer to a Machine. A Machine's name
and hostname do not form part of its identity.

### Thread Working Directory

The fixed absolute folder on a Machine from which a Thread runs. It remains
unchanged for the lifetime of the Thread.
_Avoid_: Project, thread root, workplace, workspace

### Git Context

Optional metadata describing the Git repository that contains a Thread Working
Directory. It includes that directory's path relative to the repository root
and may include the GitHub repository URL from which it was cloned. It is an
immutable snapshot taken when the Thread is created. The relative path is empty
when the Thread Working Directory is the repository root.

### Contract

The RPC surface shared between the server host and connected clients: the set
of named procedures with their payload, success, and error schemas. The
contract is the only thing a client needs to talk to the server.

Version 1 exposes `startThread`, `startRun`, and `interruptRun`. Contract input
types may track the current TanStack harness packages; orchestrators translate
accepted inputs into the narrower Persisted Run Configuration.

### Domain

Fundamental schemas and pure functionality of the package. Knows nothing about
storage, transport, or hosting. The contract's schemas are domain schemas.

### Service

A capability with an external effect or resource — e.g. the sqlite database.
Services take configuration and manage their own lifecycle; they contain no
domain decision-making.

### Orchestrator

Ready-to-use functionality composed from services and domain. Orchestrators are
what the package actually _does_; they are transport-agnostic and know nothing
about the contract.

### Handler

A thin adapter that implements one contract procedure by delegating to
orchestrators. Handlers hold no logic of their own.

### Host

The process that takes the package's handlers and exposes them over a
transport. `whatever/code` never runs a server itself — the `whatever` CLI is
the host, serving the handlers over websocket RPC so other clients can connect.
