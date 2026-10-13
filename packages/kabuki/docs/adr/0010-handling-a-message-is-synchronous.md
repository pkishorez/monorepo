# Handling a Message is synchronous; everything around it is Effect

Sending a Message handles it before `send` returns: the pure Update runs and the Snapshot is replaced at once. The Runtime around it (its Scope, the Capabilities, Lifetimes and Commands, Replay, stop and start) is written in Effect.

## Considered Options

- **A fiber taking Messages from an Effect Queue**: rejected. A controlled input would be reset to its old value at the end of the keypress and set again a tick later, so the caret jumps and fast typing loses characters. This is the same reason [ADR 0007](0007-the-log-is-a-tree-the-runtime-runs-in-memory.md) kept writes off the Message path.
- **An Effect loop drained with `runSync` on every send**: rejected. It is the synchronous design with more steps, and it throws as soon as anything in it suspends.
