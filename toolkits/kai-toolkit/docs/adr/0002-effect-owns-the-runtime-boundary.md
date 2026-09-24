# Effect owns lifecycle around TanStack chat

> **Status:** superseded by ADR-0010. TanStack `chat()` no longer runs the harness; runners write to a Transcript.

The toolkit's services, streams, scopes, persistence, and RPC contracts are Effect-native. Each harness-specific start handler selects exactly one coding-harness adapter and runs it through TanStack AI `chat()`, then converts the resulting `AsyncIterable` into the detached Effect stream owned by the Harness Host. TanStack owns the agent-loop and AG-UI translation boundary; it does not own Run lifetime, waiting interactions, replay, or cancellation.
