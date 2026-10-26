---
'@kestack/connect': patch
'@kestack/ai-toolkit': patch
'@kestack/web-platform': patch
'code': patch
---

A Machine is now a Connection, an App Group is now a Plugin, and the status of a socket to a Connection is its Link.

- Breaking: `./machine` is `./connection` (`serve`, `logout`, `resolvePaths`); `ke-connect` keeps its name.
- Breaking: `Machine`, `MachineReport`, `MachineStatus`, `MachineForgotten`, `MachineTaken`, `MachineAddress` and `MachineClient` are `Connection`, `ConnectionReport`, `ConnectionStatus`, `ConnectionForgotten`, `ConnectionTaken`, `ConnectionAddress` and `ConnectionClient`; `CodeClients.machine` is `CodeClients.connection`, and every `machineId` is `connectionId`.
- Breaking: `connection`, `ConnectionStatus` (of the socket) and `CodeClients.connection` (the stream) are `link`, `LinkStatus` and `CodeClients.link`, with `linking`, `linked` and `relinking` for `connecting`, `connected` and `reconnecting`.
- Breaking: `AppGroup`, `codeGroup`, `CodeGroupOptions` and the server's `groups` are `Plugin`, `codePlugin`, `CodePluginOptions` and `plugins`.
- Breaking: Cloud Connect keeps Connections in a new `connections` table (`connectionsTable`, was `machinesTable`), and Connect keeps its id and Connection Key in `connection.json`, so every Connection signs in and registers afresh.
- Code says Connection and Link: Settings lists your Connections, a page on one is at `/c/:connectionId/…` (was `/m/`), and the pill says "Linking…" or "Relinking…". The saved list of Connections, the Connection Filter and the Unseen marks start empty.
