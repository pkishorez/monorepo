---
'@kstackz/rpc-toolkit': patch
---

Initial release under the `@kstackz` scope.

Adds rules to Effect RPC and HttpApi endpoints (such as "this needs a signed-in user") that the server checks and the client satisfies, plus WebSocket clients and Cloudflare Durable Object hosting with hibernation-safe streams. You need it so every app does not re-invent endpoint guards and reconnecting streams.
