---
'@kestack/connect': patch
'@kestack/ai-toolkit': patch
'@kestack/web-platform': patch
---

Renames: a Machine is now a Connection, an App Group a Plugin, and a socket's status its Link.

- Breaking: every `Machine*` name is `Connection*`, and `machineId` is `connectionId`.
- Breaking: socket `connection` status is `link` (`linking`, `linked`, `relinking`).
- Breaking: `AppGroup`, `codeGroup` and `groups` are `Plugin`, `codePlugin` and `plugins`.
- Breaking: every Connection signs in and registers again.
- Code's routes are `/c/:connectionId/…`, and its saved Connection list starts empty.
