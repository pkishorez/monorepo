# Kishore's monorepo

A collection of open-source TypeScript projects focused on Effect, monorepo
architecture, local developer tooling, data modeling and sync, and React.

The packages are developed together in a pnpm workspace and share the same
build, lint, test, formatting, and release infrastructure. Package documentation
is available at [docs.kishore.app](https://docs.kishore.app).

## What's included

### Applications

| Workspace                  | Purpose                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`apps/docs`](./apps/docs) | Documentation site for the public packages, built with Fumadocs and TanStack Start and deployed to Cloudflare Workers. |

### Developer tools

These packages share a fixed Changesets version and are released together.

| Workspace                                  | Package                                                                    | Purpose                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`devtools/devtools`](./devtools/devtools) | [`@pkishorez/devtools`](https://www.npmjs.com/package/@pkishorez/devtools) | Local DevTools server for inspecting dependency graphs and OpenTelemetry traces, logs, and metrics.                       |
| [`devtools/laymos`](./devtools/laymos)     | [`laymos`](https://www.npmjs.com/package/laymos)                           | Declares, enforces, and visualizes TypeScript architecture as layers, modules, and stories.                               |
| [`devtools/lotel`](./devtools/lotel)       | [`@pkishorez/lotel`](https://www.npmjs.com/package/@pkishorez/lotel)       | Local OpenTelemetry server and library for ingesting, storing, and querying traces, logs, and metrics during development. |

### Packages

| Workspace                                            | Package                                                        | Purpose                                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`packages/frontend`](./packages/frontend)           | `@monorepo/frontend` (private)                                 | Shared React UI components, forms, styles, hooks, and graph visualization blocks used by projects in this repository. |
| [`packages/use-effect-ts`](./packages/use-effect-ts) | [`use-effect-ts`](https://www.npmjs.com/package/use-effect-ts) | React hooks for running and consuming Effect programs.                                                                |

### Single-table design toolkit

[`std-toolkit`](./std-toolkit) ([npm](https://www.npmjs.com/package/std-toolkit))
is a published package containing a set of composable modules for
database-agnostic single-table design:

| Entry point                 | Purpose                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `std-toolkit/core`          | Shared entity, metadata, broadcasting, and error primitives.                                    |
| `std-toolkit/eschema`       | Versioned, self-migrating schemas built on Effect Schema, including the `eschema` CLI.          |
| `std-toolkit/dynamodb`      | DynamoDB table and entity services, expression builders, and marshalling utilities.             |
| `std-toolkit/sqlite`        | SQLite services with adapters for Node.js, Bun, better-sqlite3, and Cloudflare Durable Objects. |
| `std-toolkit/tanstack-sync` | TanStack DB synchronization with paced writes and IndexedDB offline storage.                    |

See the [std-toolkit README](./std-toolkit/README.md) for installation and
entry-point documentation.

## Toolchain

- TypeScript and Effect
- pnpm workspaces
- Vite+ for repository-wide tasks
- Vitest for tests
- Changesets for package versioning and npm releases

## Getting started

The release workflow uses Node.js 24 and pnpm 10.

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
pnpm --filter std-toolkit test
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
