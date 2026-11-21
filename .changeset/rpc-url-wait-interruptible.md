---
'@kestack/rpc-toolkit': patch
---

A WebSocket `client` given its URL as an Effect that waits can now close while it waits. Before, closing it waited with the URL, for ever if the URL never came.
