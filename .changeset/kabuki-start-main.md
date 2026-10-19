---
'@kestack/kabuki': patch
---

A Start app whose Worker must export more than Start's handler, as one hosting a Durable Object, names its own main to the plugin: `start({ platform: cloudflare(), main: 'src/worker.ts' })`, a module that default-exports `virtual:kabuki-start/worker` or wraps it. The plugin builds it as the server's one input, which Alchemy's Cloudflare plugin takes as the Worker's main; before, giving `Website.Vite` a `main` made the build two inputs and failed.
