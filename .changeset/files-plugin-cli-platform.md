---
'@kestack/cli-platform': patch
---

A Plugin can serve HTTP routes of its own beside its RPC group, and a Public Area that a caller without the CLI's key may reach.

**Added**

- `Plugin.make` takes `routes`, served beside `/rpc` to a caller with the key, and `publicRoutes`, served under `/public/` to anyone. Both are handed the services the Plugin's `layer` makes, and may stream a file with any status and headers; HEAD is answered from GET.
- `PluginAccess`, the `x-ke-connect-access` header a CLI sets on each request it passes on: `key` or `public`.
- `PluginPaths.public`.
- `PluginEnv.access`, `KESTACK_PLUGIN_ACCESS`: `ActorPlugin` starts a Plugin with it set, saying every request it is passed is marked.

**Changed**

- A request marked `public` reaches only the Public Area, and never with a `.`, `..` or empty segment or an encoded `/`, `\` or `.`. A request with no header reaches nothing once the CLI sets `KESTACK_PLUGIN_ACCESS`; from a CLI that does not, older than the Public Area, it is taken as holding the key.
- Requests to the Public Area are not logged, since their URL can be their credential.
