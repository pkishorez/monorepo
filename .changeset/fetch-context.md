---
'@kestack/connect': patch
---

A Session's Context Usage can be fetched with its Agent closed.

**Added**

- The `fetchContext` RPC says how full a Session's context is even with its Agent closed, as after a restart, when `contextUsage` fails. It reads from a copy of the Agent resumed just for that and closed again: no model is called, and the Session's own Agent stays closed.
