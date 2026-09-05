---
name: auth-toolkit
description: Provision a shared auth worker with Alchemy and GitHub Actions, connect application login and sessions, and protect Effect RPC endpoints with authentication guards and authorization policies.
---

# Auth toolkit

Three parts, each usable on its own:

- **Infrastructure** — the shared Cloudflare auth worker, D1, KV, and deployment through GitHub Actions. Read [the infrastructure guide](infrastructure/guide.md).
- **Application setup** — client login, logout, and session hooks, plus server authentication wiring. Read [the setup guide](setup/guide.md).
- **Usage** — RPC authentication guards and authorization policies. Read [the usage guide](usage/guide.md).

Start with the requested part. Applications share one production auth instance, including during local development. Provision infrastructure only when requested.

Inspect existing code and installed toolkit exports before implementing. Read the package documentation and source for the APIs involved; use the installed version when examples differ. Use the grilling skill for unresolved decisions and reuse agreements already reached.

For application placement and composition, read [the software-factory architecture conventions](../software-factory/architecture.md). Keep authentication instructions in this skill.
