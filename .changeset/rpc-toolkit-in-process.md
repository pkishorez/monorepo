---
'@kstackz/rpc-toolkit': minor
---

New subpath `rpc/in-process` with `layerInProcessProtocol(group)`: an `RpcClient.Protocol` that calls the group's handlers in the same process, with no transport and no serialization. Ordinary client code (`RpcClient.make(group)`) runs against it unchanged, and headers, client middleware, and server middleware apply as over HTTP. Use it in a page or React Native process that runs its backend locally, or in tests.
