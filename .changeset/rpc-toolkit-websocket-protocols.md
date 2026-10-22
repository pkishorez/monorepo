---
'@kestack/rpc-toolkit': patch
---

The websocket `client` takes `protocols`, offered in `Sec-WebSocket-Protocol`, the one header a browser lets a WebSocket set. Like `url`, it may be an Effect, run before every connect.
