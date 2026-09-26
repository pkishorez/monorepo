# A pending update pins navigations to the active build

While a newer version waits to be accepted, the worker answers navigations with the active build's App Shell from the Precache instead of the network. The network already serves the newer build's HTML, and loading it under the old worker gives Version Skew: its hashed assets are not in the old Precache and Worker RPC refuses its calls. Pinning keeps every tab on the active Build ID until the user accepts, which is what [ADR 0003](0003-all-tabs-run-one-version.md) asks for.

## Consequences

Until the update is accepted, reloads and new tabs get the client-rendered App Shell, never fresh server-rendered HTML, even online. Route loaders still fetch their data, so pages stay current; only the SSR first paint is lost for that window.

With the App Shell off (the `content` preset), there is no page of the active build to serve, so navigations keep going to the network and a reloaded tab may load the newer build. It then shows the Update Prompt at once, because a worker is waiting, and accepting reloads it onto that build.
