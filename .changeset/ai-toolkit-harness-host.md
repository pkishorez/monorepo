---
'@kestack/ai-toolkit': patch
---

Harness sign-ins sit behind one key, `HarnessHost` from `/harness`: whether a Harness Binary runs (`binaryAt`, `checkBinary`) and which config folder an account really uses (`configFolderOf`). `harnessHostLayer` from `/harness/node` is the one on this computer, so a browser can give a fake.
