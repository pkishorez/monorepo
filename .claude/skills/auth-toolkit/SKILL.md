---
name: auth-toolkit
description: Provision a shared auth worker with Alchemy and GitHub Actions, connect application login and sessions, and protect Effect RPC endpoints with authentication guards and authorization policies.
---

# Auth toolkit

Start with the requested part; each guide works independently.

## Choose a guide

Follow [infrastructure](infrastructure/guide.md) to provision the shared Cloudflare worker, D1, KV, and GitHub deployment when requested.

Follow [application setup](setup/guide.md) to connect login, logout, sessions, and server authentication.

Follow [usage](usage/guide.md) to protect RPC endpoints with authentication and permission policies.

## Working rules

Share one production auth instance across applications, including local development.

Inspect existing code, package documentation, and toolkit exports; use installed APIs when examples differ.

Use grilling for unresolved decisions and reuse existing agreements.

Follow [web architecture](../software-factory/applications/web/architecture.md) for placement and keep authentication guidance here.
