---
'@kestack/rpc-toolkit': patch
---

`client` in `./rpc/websocket` takes `watch`, told of each socket's first frame in (`answered`) and how it closed (`closed`, with its code and reason): a browser cannot read why a server refused a WebSocket, only how it closed. `SocketWatch` and `SocketClose` are exported.
