---
'laymos': patch
'@kestack/effect-tracer': patch
'@kestack/web-platform': patch
'@kestack/auth-toolkit': patch
'@kestack/rpc-toolkit': patch
'@kestack/std-toolkit': patch
'@kestack/devtools-kabuki': patch
'@kestack/ai-toolkit-v2': patch
'@kestack/ai-toolkit': patch
'@kestack/kabuki': patch
'use-effect-ts': patch
'@kestack/cli-platform': patch
---

Effect 4.1.5. Every package's `effect` peer is now `^4.1.5`, so a consumer needs Effect 4.1.5 or newer, as the `@effect/platform-node` and `@effect/opentelemetry` 4.1.5 they ship do. Peers a consumer installs moved with it: `alchemy` and `@alchemy.run/*` are now `2.0.0-beta.87`.

- devtools-kabuki: tells a server going down apart from a client leaving again, now that `Exit.hasInterrupts` no longer narrows an Exit to a failure.
