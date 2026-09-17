---
'kstack': patch
'@pkishorez/lotel': patch
'laymos': patch
---

Rename `@pkishorez/devtools` to `kstack`. The binary is now `kstack`: `kstack devtools` runs the DevTools Server, and the Client Commands `kstack list-traces`, `kstack get-trace`, `kstack list-flows`, and `kstack get-flow` read Traces and Flows from it as simplified JSON or readable text. `kstack skills` lists the shipped agent skills, `kstack skills devtools` prints one, and `--install <dir>` copies one or all of them into `<dir>/<name>/`. laymos gains the same `laymos skills` command shipping the `laymos`, `to-laymos`, `domain-modeling`, and `deep-module` skills, and exports the shared command builder as `laymos/skills-command`. The server URL resolves from `--url`, `DEVTOOLS_URL`, or `DEVTOOLS_PORT`. The RPC contract export moves to `kstack/rpc`. lotel gains a `ListTraces` RPC that returns Trace Summaries for the most recently updated Traces.
