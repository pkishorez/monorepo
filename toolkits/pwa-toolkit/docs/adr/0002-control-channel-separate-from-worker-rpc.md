# Control Channel is a frozen message protocol, not Worker RPC

The toolkit's own traffic between tabs and the service worker (which version is running, activate the waiting version, clear caches) uses a tiny, frozen `postMessage` protocol instead of Worker RPC.

Activation has to reach the _waiting_ worker, which runs a different build than the tab talking to it, so this traffic must keep working across every version. Freezing it outside Worker RPC keeps Worker RPC a truly optional capability and keeps Version Skew out of the core.
