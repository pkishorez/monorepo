# AI Toolkit

Server-side execution of coding agents whose conversations outlive individual client connections. The context owns application threads and runs while preserving each coding harness's native identity and interaction semantics.

## Language

**Coding Harness**:
A provider-native coding agent, such as Claude Code or Codex, that executes work and may pause for input during a turn.
_Avoid_: model, provider, agent SDK

**Language Model**:
A named model offered through a Coding Harness, such as a particular Claude or Codex model. Selecting a Language Model narrows the options accepted by that harness.
_Avoid_: harness, run model, provider

**Harness Host**:
The server-side owner of live Runs. It selects a Coding Harness, holds waiting processes and interaction state, and coordinates persisted Run State.
_Avoid_: RPC server, model, registry

**Thread**:
The application-owned conversation identity and stable execution context for one Coding Harness, including its working directory and harness-specific native data. A Thread has at most one active Run.
_Avoid_: session, harness thread

**Run**:
One user turn, from the initial request through all questions and approvals to one terminal outcome. Its identity is minted by the client, and it owns that turn's Language Model, reasoning, access, and harness-specific configuration. A Run carries its own lifecycle status: running, waiting, completed, failed, or cancelled.
_Avoid_: continuation run, iteration, request

**Thread Status**:
The live state of a Thread, updated on every Run transition: idle, running, waiting-question, waiting-approval, cancelled, or failed. A finished Run returns the Thread to idle; a cancelled or failed Run leaves that outcome on the Thread until the next Run starts.
_Avoid_: interrupted, streaming flag, message status

**Cancelled**:
A Run stopped from outside the Coding Harness while otherwise healthy: a user cancel, a server shutdown, or the bootstrap sweep finding an orphaned Run.
_Avoid_: interrupted, aborted, failed

**Failed**:
A Run the Coding Harness itself ended abnormally: an SDK error, a dead process, or a timeout.
_Avoid_: cancelled, error state

**Message**:
An immutable record of one flush from a Run's Transcript: a role and the parts collected since the previous flush, such as text, thinking, tool calls, tool results, and typed interactions. A long turn is several Messages; consumers fold consecutive Messages of one Run and role into a rendered turn. The same Message shape is stored, synced, and rendered.
_Avoid_: chunk, event, delta, AG-UI event, turn

**Transcript**:
The single writing surface a Coding Harness has during a Run. A harness appends text, thinking, tool calls, tool results, and harness-specific parts to it; the Transcript batches those writes by time and size and persists each batch as one Message. A harness never touches storage directly.
_Avoid_: stream, assembly, processor, run log

**Harness Thread**:
The opaque, harness-owned conversation identity used to resume native context. It is distinct from the application-owned Thread and may participate in provider-specific session lineage.
_Avoid_: session ID, application thread, resume token

**Harness Turn**:
A harness-owned execution identity corresponding to a Run when the Coding Harness exposes one.
_Avoid_: run ID

**Interaction Request**:
A request emitted by a Run when it needs external input before it can proceed, such as an answer or approval.
_Avoid_: interrupt, boolean prompt

**Resolution**:
The typed response to an Interaction Request. Common Resolutions exist only where harnesses share the same semantics; otherwise the Resolution remains harness-specific.
_Avoid_: answer boolean, continuation

**Active Run**:
The sole non-terminal Run belonging to a Thread. It is either executing or waiting for a Resolution.
_Avoid_: current request

**Run State**:
The facts describing Threads and Runs, including configuration, native identities, execution status, and terminal outcomes. Pending Interaction Requests belong to live runtime state.
_Avoid_: model, database model, agent state

**Playground Server**:
A local, ephemeral Harness Host used to exercise the public RPC from a browser demo against the directory in which the server was started.
_Avoid_: production host, docs server

**Playground RPC**:
Demo-only operations for creating and querying Playground Server state. It is separate from the execution-focused public AI RPC.
_Avoid_: AI RPC, admin API

**Bootstrap Sweep**:
The startup step of the Harness Host that reads every Run still running or waiting, marks each cancelled, and sets its Thread Status to cancelled.
_Avoid_: recovery, orphan reaper, garbage collection
