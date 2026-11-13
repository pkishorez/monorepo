# Control Channel is a frozen message protocol, not Worker RPC

> **Status:** still holds, though Worker RPC was removed. The one Command is frozen for the reason given here: it reaches the waiting worker, a newer build than the page. Its key keeps the name of `@kestack/pwa-toolkit`, which the PWA was, since a page of an older build still sends it.

The toolkit's own traffic between tabs and the service worker (which version is running, activate the waiting version, clear caches) uses a tiny, frozen `postMessage` protocol instead of Worker RPC.

Activation has to reach the _waiting_ worker, which runs a different build than the tab talking to it, so this traffic must keep working across every version. Freezing it outside Worker RPC keeps Worker RPC a truly optional capability and keeps Version Skew out of the core.

Since [ADR 0007](0007-one-status-core-and-standalone-extras.md) the protocol carries one Command, asking the waiting version to activate; the other two were never sent.
