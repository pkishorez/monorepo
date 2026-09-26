# Worker RPC sends each message through the controller, not a long-lived port

Effect's worker protocol expects one long-lived `MessagePort` per connection. A service worker is stopped whenever it is idle, and a port held by a stopped worker dies without reliably telling the tab. So each Tab Client message goes through `navigator.serviceWorker.controller.postMessage`, which wakes a stopped worker, and the Worker Server replies through the sending tab's `Client`, identified by its `clientId`. Both ends are small adapters behind Effect's `WorkerPlatform` and `WorkerRunnerPlatform`, so Effect RPC itself is unchanged.

## Consequences

The Worker Server holds itself alive with `waitUntil` only while a call is in flight. Streams that outlive the browser's limits are cut and resume through Subscription Restart, so the Worker Server must stay stateless.
