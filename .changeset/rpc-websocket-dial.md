---
'@kestack/rpc-toolkit': patch
---

The websocket `client` takes `dial`, what opens each socket in place of the global `WebSocket`, such as an in-memory one whose other end is a server in the same page; its type is `Dial`. A close with no code is told to `watch` as 1006.
