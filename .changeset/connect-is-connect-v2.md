---
'@kestack/connect': patch
'@kestack/connect-cloud': patch
---

`@kestack/connect` is now Connect v2, a rewrite: `ke-connect` signs in, opens a Cloudflare tunnel, reports its Heartbeat to Connect Cloud (`@kestack/connect-cloud`), and runs each Plugin Connect Cloud enables for it as its own process, which imports `@kestack/connect/plugin`. Nothing of v1 carries over: its `code`, `cloud`, `browser`, `fake`, `worker` and `dev` doors are gone. It is private until it is published again.
