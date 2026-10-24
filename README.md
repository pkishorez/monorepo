# monorepo

## Everything I build, in one monorepo.

A collection of open-source TypeScript projects focused on Effect, monorepo
architecture, local developer tooling, data modeling and sync, and React.

The packages are developed together in a pnpm workspace and share the same
build, lint, test, formatting, and release infrastructure. Live demos of the
packages are at [docs.kishore.app](https://docs.kishore.app).

## What's included

### Applications

| Workspace                  | Purpose                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| [`apps/docs`](./apps/docs) | Live demos of the public packages, a plain TanStack Start app deployed to Cloudflare Workers. |

## kstack packages

These packages are published under the `@kestack` npm scope (plus `laymos`
and `use-effect-ts`). They release in two version groups, so keep each group
on one version: the stack (ai-toolkit, auth-toolkit, rpc-toolkit, std-toolkit
and web-platform) and DevTools (devtools, effect-tracer and
laymos). kabuki, use-gesture, use-keys and `use-effect-ts` depend on nothing
here and version on their own. See [ADR 0009](./docs/adr/0009-two-version-groups-the-stack-and-devtools.md).

### Toolkits

| Workspace                                            | Package                                                                        | Purpose                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`toolkits/std-toolkit`](./toolkits/std-toolkit)     | [`@kestack/std-toolkit`](https://www.npmjs.com/package/@kestack/std-toolkit)   | Single-table data modeling, schema evolution, database adapters, and sync.                                                                                                                                                                                                                |
| [`platforms/web-platform`](./platforms/web-platform) | [`@kestack/web-platform`](https://www.npmjs.com/package/@kestack/web-platform) | The Web Platform: a web app from one config, as a PWA on TanStack Start with its Theme, its APIs on a cloud or a device Backend, several Accounts with one Session each, the screens before sign-in, and the server; plus the components, input, forms and Recipes to build screens with. |
| [`toolkits/ai-toolkit`](./toolkits/ai-toolkit)       | [`@kestack/ai-toolkit`](https://www.npmjs.com/package/@kestack/ai-toolkit)     | Runs Claude Code and Codex turns on a server and stores them in a StdTable.                                                                                                                                                                                                               |
| [`toolkits/rpc-toolkit`](./toolkits/rpc-toolkit)     | [`@kestack/rpc-toolkit`](https://www.npmjs.com/package/@kestack/rpc-toolkit)   | Effect RPC and HttpApi with Middleware, three Transports with a fixed protocol, and Cloudflare deploys.                                                                                                                                                                                   |
| [`toolkits/auth-toolkit`](./toolkits/auth-toolkit)   | [`@kestack/auth-toolkit`](https://www.npmjs.com/package/@kestack/auth-toolkit) | Shared authentication worker, sessions, and authorization integrations.                                                                                                                                                                                                                   |
| [`packages/use-gesture`](./packages/use-gesture)     | [`@kestack/use-gesture`](https://www.npmjs.com/package/@kestack/use-gesture)   | Touch gestures: a platform-free core that reads every finger of a touch from any touch source. Its web side is in @kestack/web-platform's input, its native side in @kestack/expo-platform's.                                                                                             |
| [`packages/use-keys`](./packages/use-keys)           | [`@kestack/use-keys`](https://www.npmjs.com/package/@kestack/use-keys)         | Keyboard shortcuts for React: every key the page hears, and the Shortcuts and Sequences built on it.                                                                                                                                                                                      |

### Developer tools

| Workspace                                            | Package                                                                          | Purpose                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`devtools/devtools`](./devtools/devtools)           | [`@kestack/devtools`](https://www.npmjs.com/package/@kestack/devtools)           | Local DevTools server for traces, logs, and architecture, plus Client Commands for reading traces. |
| [`devtools/effect-tracer`](./devtools/effect-tracer) | [`@kestack/effect-tracer`](https://www.npmjs.com/package/@kestack/effect-tracer) | In-process recording and OTLP export for Effect traces and logs.                                   |
| [`devtools/laymos`](./devtools/laymos)               | [`laymos`](https://www.npmjs.com/package/laymos)                                 | Declares and enforces TypeScript architecture as layers.                                           |

## Stand-alone packages

These keep their own names and versions.

| Workspace                                            | Package                                                            | Purpose                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| [`packages/kabuki`](./packages/kabuki)               | [`@kestack/kabuki`](https://www.npmjs.com/package/@kestack/kabuki) | An app as one tree of Actors on Effect, drawn by React. |
| [`packages/use-effect-ts`](./packages/use-effect-ts) | [`use-effect-ts`](https://www.npmjs.com/package/use-effect-ts)     | React hooks for running and consuming Effect programs.  |

## Single-table design toolkit

[`@kestack/std-toolkit`](./toolkits/std-toolkit) ([npm](https://www.npmjs.com/package/@kestack/std-toolkit))
is a published package containing a set of composable modules for
database-agnostic single-table design:

| Entry point                        | Purpose                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `@kestack/std-toolkit/core`        | Shared entity, metadata, broadcasting, and error primitives.                           |
| `@kestack/std-toolkit/eschema`     | Versioned, self-migrating schemas built on Effect Schema, including the `eschema` CLI. |
| `@kestack/std-toolkit/db`          | Portable Table and Entity definitions and operations.                                  |
| `@kestack/std-toolkit/db/dynamodb` | DynamoDB binding, setup, expressions, and native operations.                           |
| `@kestack/std-toolkit/db/sqlite`   | SQLite binding and setup, with separate runtime driver entrypoints.                    |
| `@kestack/std-toolkit/db/idb`      | IndexedDB binding and explicit Store setup.                                            |
| `@kestack/std-toolkit/sync`        | TanStack DB synchronization with local replicas, paced writes, and Peer Sync.          |

See the [std-toolkit README](./toolkits/std-toolkit/README.md) for installation and
entry-point documentation.

## Toolchain

- TypeScript and Effect
- pnpm workspaces
- Vite+ for repository-wide tasks
- Vitest for tests
- Changesets for package versioning and npm releases

## Getting started

The release workflow uses Node.js 24 and pnpm 11.

```bash
corepack enable
pnpm install
```

Run a task across all workspaces that define it:

```bash
pnpm build
pnpm lint
pnpm test
pnpm fmt
```

To work on one project, filter by its workspace name:

```bash
pnpm --filter docs dev
pnpm --filter @kestack/std-toolkit test
pnpm --filter laymos lint
```

Other useful repository commands:

| Command          | Purpose                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `pnpm dev`       | Start the development tasks exposed by the workspaces.            |
| `pnpm clean`     | Remove generated `dist` directories and installed `node_modules`. |
| `pnpm changeset` | Describe a publishable package change.                            |
| `pnpm version`   | Apply pending changesets and update package versions.             |
| `pnpm release`   | Publish versioned packages to npm.                                |

Releases from `main` are managed by Changesets through the GitHub Actions
release workflow.
