---
'@kestack/ai-toolkit': patch
---

`/harness` and `/speech` hold only what runs in a browser too: the contract, the Services a program asks for, and their errors. What starts processes or reads files moves behind two new doors: `/harness/node` has `claude`, `codex`, `codexOneShot`, `checkBinary`, `configFolderOf` and `modelsLayer` (was `Models.layer`); `/speech/node` has `speechLayer` (was `Speech.layer`) and `sherpa`. Breaking: import those from the `/node` doors.
