# Compose camel-cased RPC groups

> **Status:** current. The common group now holds only `cancelRun`; observation moved to the AI Table (ADR-0010).

The public Effect RPC contract is one `AiRpc` formed by merging a common lifecycle group with Claude and Codex groups. Harness-specific procedures use camel-cased prefixes such as `claudeStart` and `codexRespond`; common procedures use verb-first names such as `watchRun`. Dotted tags were rejected because Effect's generated client would require bracket access rather than producing a nested client object. Harness-specific start and response procedures preserve narrowed options and native interaction semantics without a growing discriminated union in common RPC.
