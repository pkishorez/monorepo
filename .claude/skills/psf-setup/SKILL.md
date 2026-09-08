---
name: psf-setup
description: Bootstraps a new application my way, composed from the primitives in this folder.
disable-model-invocation: true
---

This is my personal software factory. Use it to create a new application inside this monorepo. Build the app by adopting primitives from `primitives/` and following each primitive's README.

## Prerequisites

The monorepo is already set up with pnpm workspaces, Syncpack, catalogs, and Vite+. Reuse them. Internal dependencies use `workspace:*`, external ones use `catalog:`.

## Setup

Ask the user for the app name and where it should live.
Ask for the production host if the app will be deployed.
Ask which primitives to include and a name for each instance.
Confirm all answers before creating any file. Whenever something is unclear, ask.

Copy `primitives/application` into the app folder. It is the skeleton every app starts from. Follow its README: set the name, title, hosts, and every other placeholder from the user's answers.

## Primitives

Add primitives on top of the skeleton. For each one, follow its README. Make sure to configure Laymos layers/modules and rules.

A primitive can be added more than once. Each instance is its own resource with its own name, files, and identifiers; nothing is called `app` or plain `rpc`. To add a second instance, repeat the README with the new name.

## Naming

Every instance has a name: one lowercase word (`chat`, `billing`, `sessions`). Primitive files spell it as `__NAME__` (`chat`), `__Name__` (`Chat`), and `__NAME_ENV__` (`CHAT`). The name decides where things live.

RPC groups belong to features, not instances. An instance picks which groups it hosts, so two instances never duplicate a definition.

Below are the list of primitives:

- For a client that talks to a worker over HTTP, use `rpc-worker`.
- For a client that talks to a Durable Object over WebSocket, with live updates or per-object state, use `rpc-durable-object`.
- For a table stored in the Durable Object's own SQLite, use `storage-do-sqlite`. It needs `rpc-durable-object`.
- For a table on DynamoDB, use `storage-dynamodb`. It works with either RPC primitive.
- For deploy on push and a preview per PR, use `github-actions`.

When done, `grep -r "__" <app-folder>` and `find <app-folder> -name "*__*"` must find no placeholder.

## Verification

Run `pnpm install` at the root.

From the app folder, all of these must pass before you finish:

```sh
pnpm build # run this first. This generates routeTree.gen.ts file.
pnpm lint
pnpm test
```

Finish by telling the user the app folder, the local URL, and how to deploy. Never set `ALLOW_DEPLOY` locally. Leave business features for after setup.
