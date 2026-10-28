---
'@kestack/connect': patch
'code': patch
---

Cloud Connect has a door of its own, `@kestack/connect/cloud`, so the code Plugin no longer carries the Cloud client.

- Breaking: `CloudClient`, `VersionGap`, `Connection`, `ConnectionStatus` and `addressOf` come from `@kestack/connect/cloud`, with `authInfo`; `@kestack/connect/code` no longer exports them, nor `CloudApi`, `ConnectionReport`, `TunnelCheck`, `ConnectionForgotten`, `ConnectionTaken`, `RPC_PATH` or `AUTH_PATH`.
- The code Plugin's own files, what serves it on the socket Connect gives it, are grouped under `src/plugins/code/serve/`; the Plugin's file is still `dist/plugin/code.mjs`, and it no longer bundles the Cloud client.
