# Cannotation splits Declaration from Implementation

> Names changed in [ADR 0005](../../../../docs/adr/0005-three-toolkits-three-doors.md): Cannotation is now Middleware (`Rpc.middleware`, `HttpApi.middleware`, `clientLayer` is `client`), and the package has three doors, `rpc`, `http-api` and `alchemy`.

An endpoint contract (an `RpcGroup` or `HttpApiGroup`) is imported by both the client and the server bundle, so anything a Cannotation needs at declaration time ends up in both. We therefore make `Cannotation.make` produce an implementation-free Declaration (`with`, `get`) and take the server and client logic separately through `layer(impl)` and `clientLayer(impl)`, mirroring how Effect itself separates `RpcMiddleware.Service` from `Layer.effect` and `RpcMiddleware.layerClient`. The one-entry-point form where `make` received `server` and `client` inline was rejected because it leaks server code (resolvers, storage) into the browser bundle.
