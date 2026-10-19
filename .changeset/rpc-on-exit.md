---
'@kestack/rpc-toolkit': patch
---

A Client Implementation can now react to how a call ended: `next(request).pipe(Rpc.onExit((exit) => ...))` runs the observer with the call's decoded Exit before the caller sees it, over the http, websocket and inProcess Transports alike. The `Rpc.http` client also honours `FetchHttpClient.RequestInit` given around `next`, so a Client Implementation can set fetch options such as `credentials` for the calls it signs.
