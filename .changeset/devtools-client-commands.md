---
'@pkishorez/devtools': patch
'@pkishorez/lotel': patch
'laymos': patch
---

Add Client Commands to `@pkishorez/devtools`. The `devtools` binary still runs the DevTools Server; the new subcommands `devtools list-traces`, `devtools get-trace`, `devtools list-flows`, and `devtools get-flow` read Traces and Flows from it as simplified JSON or readable text. `devtools skills` lists the shipped agent skills, `devtools skills devtools` prints one, and `--install <dir>` copies one or all of them into `<dir>/<name>/`. laymos gains the same `laymos skills` command shipping the `laymos`, `to-laymos`, `domain-modeling`, and `deep-module` skills, and exports the shared command builder as `laymos/skills-command`. The server URL resolves from `--url`, `DEVTOOLS_URL`, or `DEVTOOLS_PORT`. lotel gains a `ListTraces` RPC that returns Trace Summaries for the most recently updated Traces.
