---
'@kestack/cli-platform': patch
---

New: `@kestack/cli-platform`, what every kestack CLI needs on a computer. `./files` gives a CLI's folders per name, with one shared cache, and `Downloads`, one checked copy of each download that two processes fetch once. `./single` holds a name as one process, and hands a second one a client to it. `./plugins` keeps a Plugin running at the hash, or local file, its CLI wants, with `ActorPlugin` and the `Plugins` Capability; `./plugins/plugin` is the Plugin's side, `Plugin.make`.
