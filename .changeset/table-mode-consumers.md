---
'@kestack/ai-toolkit': patch
'@kestack/rpc-toolkit': patch
'@kestack/web-platform': patch
'@kestack/devtools': patch
---

Each table now declares its std-toolkit mode. ai-toolkit keeps a Machine's identity and its records `persistent`, and the CLI's remembered sign-ins `disposable`. rpc-toolkit's stream store is `disposable`: a wipe only drops pending resumes. The Web Platform keeps every device table `disposable` (ADR 0006), and its `TableSource` is now the whole StdTable, since setup checks the table's contract. devtools keeps its project registry `persistent` and its local telemetry `disposable`.
