---
'@kestack/connect': patch
---

Breaking: `@kestack/connect/node` is now `@kestack/connect/machine`, and it also exports `resolvePaths`. Inside, the program on a computer is one `machine` tree (its `online`, `server`, `paths` and the `code` App Group), the shared dev Connect is `dev`, and Cloud Connect is its `contract`, `client` and `worker`.
