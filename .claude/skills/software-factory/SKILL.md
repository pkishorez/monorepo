---
name: software-factory
description: Build web applications with STD toolkit modeling, Effect operations, RPC toolkit APIs, and STD toolkit client sync. Use for shared/server/client boundaries and route organization; enter each part independently.
---

# Software factory

Read [the architecture conventions](architecture.md) when choosing placement, dependencies, or application wiring. Use [the glossary](CONTEXT.md) for this skill’s terminology.

Four parts, each usable on its own:

- **Modeling** — evolving schemas, entities, and STD tables. Read [the modeling guide](modeling/guide.md).
- **Operations** — application behavior expressed as Effect programs, portable or server-specific. Read [the operations guide](operations/guide.md).
- **RPC** — API definitions, handlers, and client composition using RPC toolkit. Read [the RPC guide](rpc/guide.md).
- **Sync** — STD toolkit collections, subscriptions, and optimistic/offline actions. Read [the sync guide](sync/guide.md).

Start with the requested part. A complete setup starts with modeling.
For application authentication setup or RPC authentication and authorization guards, read [the auth-toolkit skill](../auth-toolkit/SKILL.md). Start with Application setup or Usage.
Inspect existing code and installed toolkit APIs before implementing. Use the grilling skill for unresolved decisions and reuse agreements already reached. Finish by checking the affected behavior, types, and Laymos rules, and report remaining limitations.
