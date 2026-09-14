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
One user turn, from the initial request through all questions and approvals to one terminal outcome. Its identity is minted by the client, and it owns that turn's Language Model, reasoning, access, and harness-specific configuration.
_Avoid_: continuation run, iteration, request

**Message**:
A completed conversation entry assembled from a Run's streamed events. A Message contains renderable parts such as text, thinking, tool calls, and tool results; it is not an AG-UI event.
_Avoid_: chunk, event, delta

**Run Event**:
One AG-UI protocol event emitted while a Run is active, including typed common and harness-specific custom events.
_Avoid_: message, message part

**Durable Run Log**:
The ordered replay source for a Run's events while clients detach and reconnect. It is operational stream state, separate from persisted completed Messages.
_Avoid_: message store, transcript

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
The facts describing Threads and Runs, including configuration, native identities, execution status, and terminal outcomes. Pending Interaction Requests belong to live runtime state, while event sequence belongs to the Durable Run Log.
_Avoid_: model, database model, agent state
