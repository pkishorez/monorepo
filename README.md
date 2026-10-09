# monorepo

## Everything I build, in one monorepo.

A collection of open-source TypeScript projects focused on Effect, monorepo
architecture, local developer tooling, data modeling and sync, and React.

The packages are developed together in a pnpm workspace and share the same
build, lint, test, formatting, and release infrastructure. Package documentation
is available at [docs.kishore.app](https://docs.kishore.app).

## What's included

### Applications

| Workspace                                        | Purpose                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [`apps/docs`](./apps/docs)                       | Documentation site for the public packages, built with Fumadocs and TanStack Start and deployed to Cloudflare Workers.            |
| [`apps/alchemy-console`](./apps/alchemy-console) | Web console for browsing Alchemy state stores and deleting stacks, stages and resources with user-owned provider credentials.     |
| [`ledger/web`](./ledger/web)                     | Ledger on the web: a money tracker that is the blueprint for every kstack app, run by keys on desktop and by gestures on a phone. |
| [`ledger/core`](./ledger/core)                   | Everything Ledger's web and Expo apps share, platform-free; each app hands it to its Platform's `createApp`.                      |

## kstack packages

These packages are published under the `@kstackz` npm scope (plus `laymos`)
and share one version: they always release together, so keep them on the same
version. See [docs/adr/0002-one-version-for-the-kstack-packages.md](./docs/adr/0002-one-version-for-the-kstack-packages.md).

### Toolkits

| Workspace                                                  | Package                                                                                | Purpose                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`toolkits/std-toolkit`](./toolkits/std-toolkit)           | [`@kstackz/std-toolkit`](https://www.npmjs.com/package/@kstackz/std-toolkit)           | Single-table data modeling, schema evolution, database adapters, and sync.                                                                                                                                                                                                                |
| [`toolkits/platform-toolkit`](./toolkits/platform-toolkit) | [`@kstackz/platform-toolkit`](https://www.npmjs.com/package/@kstackz/platform-toolkit) | Running an app on any platform: its named APIs on a cloud or a device Backend, several Accounts signed in on one device with one Session each, and its cache. The Web and Expo Platforms are built on it.                                                                                 |
| [`platforms/web-platform`](./platforms/web-platform)       | [`@kstackz/web-platform`](https://www.npmjs.com/package/@kstackz/web-platform)         | The Web Platform: a web app from one config, as a PWA on TanStack Start with its Theme, its APIs on a cloud or a device Backend, several Accounts with one Session each, the screens before sign-in, and the server; plus the components, input, forms and Recipes to build screens with. |
| [`platforms/expo-platform`](./platforms/expo-platform)     | [`@kstackz/expo-platform`](https://www.npmjs.com/package/@kstackz/expo-platform)       | The Expo Platform: a native app from one config, its APIs on a cloud or a device Backend, several Accounts with one Session each and the screens before sign-in; plus owned Panel UI components on Uniwind, styled with web-platform's tokens, gestures, haptics and Recipes.             |
| [`toolkits/ai-toolkit`](./toolkits/ai-toolkit)             | [`@kstackz/ai-toolkit`](https://www.npmjs.com/package/@kstackz/ai-toolkit)             | Runs Claude Code and Codex turns on a server and stores them in a StdTable.                                                                                                                                                                                                               |
| [`toolkits/rpc-toolkit`](./toolkits/rpc-toolkit)           | [`@kstackz/rpc-toolkit`](https://www.npmjs.com/package/@kstackz/rpc-toolkit)           | Effect RPC and HttpApi with Middleware, three Transports with a fixed protocol, and Cloudflare deploys.                                                                                                                                                                                   |
| [`toolkits/auth-toolkit`](./toolkits/auth-toolkit)         | [`@kstackz/auth-toolkit`](https://www.npmjs.com/package/@kstackz/auth-toolkit)         | Shared authentication worker, sessions, and authorization integrations.                                                                                                                                                                                                                   |
| [`packages/effect-webrtc`](./packages/effect-webrtc)       | [`@kstackz/effect-webrtc`](https://www.npmjs.com/package/@kstackz/effect-webrtc)       | Effect-native peer sessions and RPC over WebRTC data channels.                                                                                                                                                                                                                            |
| [`packages/use-gesture`](./packages/use-gesture)           | [`@kstackz/use-gesture`](https://www.npmjs.com/package/@kstackz/use-gesture)           | Touch gestures: a platform-free core that reads every finger of a touch from any touch source. Its web side is in @kstackz/web-platform's input, its native side in @kstackz/expo-platform's.                                                                                             |
| [`packages/use-keys`](./packages/use-keys)                 | [`@kstackz/use-keys`](https://www.npmjs.com/package/@kstackz/use-keys)                 | Keyboard shortcuts for React: every key the page hears, and the Shortcuts and Sequences built on it.                                                                                                                                                                                      |

### Developer tools

| Workspace                                            | Package                                                                          | Purpose                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`devtools/devtools`](./devtools/devtools)           | [`@kstackz/devtools`](https://www.npmjs.com/package/@kstackz/devtools)           | Local DevTools server for traces, logs, and architecture, plus Client Commands for reading traces.   |
| [`devtools/lotel`](./devtools/lotel)                 | [`@kstackz/lotel`](https://www.npmjs.com/package/@kstackz/lotel)                 | Local OpenTelemetry library for ingesting, storing, and querying traces and logs during development. |
| [`devtools/effect-tracer`](./devtools/effect-tracer) | [`@kstackz/effect-tracer`](https://www.npmjs.com/package/@kstackz/effect-tracer) | In-process recording and OTLP export for Effect traces and logs.                                     |
| [`devtools/laymos`](./devtools/laymos)               | [`laymos`](https://www.npmjs.com/package/laymos)                                 | Declares and enforces TypeScript architecture as layers.                                             |

## Stand-alone packages

These keep their own names and versions.

| Workspace                                            | Package                                                        | Purpose                                                |
| ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| [`packages/use-effect-ts`](./packages/use-effect-ts) | [`use-effect-ts`](https://www.npmjs.com/package/use-effect-ts) | React hooks for running and consuming Effect programs. |

## Single-table design toolkit

[`@kstackz/std-toolkit`](./toolkits/std-toolkit) ([npm](https://www.npmjs.com/package/@kstackz/std-toolkit))
is a published package containing a set of composable modules for
database-agnostic single-table design:

| Entry point                        | Purpose                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `@kstackz/std-toolkit/core`        | Shared entity, metadata, broadcasting, and error primitives.                           |
| `@kstackz/std-toolkit/eschema`     | Versioned, self-migrating schemas built on Effect Schema, including the `eschema` CLI. |
| `@kstackz/std-toolkit/db`          | Portable Table and Entity definitions and operations.                                  |
| `@kstackz/std-toolkit/db/dynamodb` | DynamoDB binding, setup, expressions, and native operations.                           |
| `@kstackz/std-toolkit/db/sqlite`   | SQLite binding and setup, with separate runtime driver entrypoints.                    |
| `@kstackz/std-toolkit/db/idb`      | IndexedDB binding and explicit Store setup.                                            |
| `@kstackz/std-toolkit/sync`        | TanStack DB synchronization with local replicas, paced writes, and Peer Sync.          |

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
pnpm --filter @kstackz/std-toolkit test
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
