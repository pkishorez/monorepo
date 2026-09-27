# Persist assembled Message snapshots

> **Status:** amended by ADR-0010. The Transcript replaces `StreamProcessor`, Message rows are immutable, and a Resolution is still recorded as the following user Message.

The Harness Host uses TanStack AI's `StreamProcessor` to assemble AG-UI deltas into Messages and persists those Messages at terminal and interaction boundaries. A waiting Interaction Request becomes an assistant Message, its Resolution becomes the following user Message, and resumed output may update an earlier persisted Message. This supersedes the completed-Messages-only clause of ADR 0003: the AI Table remains the conversation projection and never stores raw protocol chunks.
