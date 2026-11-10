---
'@kestack/rpc-toolkit': patch
---

A call between an older side and a newer one can say which side is older, from the new `@kestack/rpc-toolkit/rpc/version-gap` door.

**Added**

- `versionedClient(group)`: `RpcClient.make(group)` on any Transport, whose every call fails with `VersionGap` where Effect RPC would die because one side is older. A server that lacks the call, or cannot read its payload, is `server`; an answer at an ESchema version this client does not know is `client`, and first runs std-toolkit's `OnOutdated`. Any other defect stays one.
- `VersionGap`: that error, with `older: 'client' | 'server'`. It moved here from `@kestack/connect`.
