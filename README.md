# Kishore's Public Packages Monorepo

A TypeScript monorepo containing all my public-facing npm packages and open-source work.

## Overview

This monorepo serves as the central hub for developing, maintaining, and publishing my open-source TypeScript/JavaScript packages. Built with modern tooling and best practices, it provides a consistent development experience across all packages.

## Packages

### [use-effect-ts](./packages/use-effect-ts)

React hooks for seamless integration with Effect.TS, providing lifecycle-aware hooks for managing Effect computations within React components.

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 8+

### Installation

```bash
# Install all dependencies
pnpm install
```

### Development

```bash
# Build all packages
pnpm -r build

# Run development mode for a specific package
pnpm --filter <package-name> dev

# Type check a specific package
pnpm --filter <package-name> lint

# Run command in all packages
pnpm -r <command>
```

## Project Structure

```
monorepo/
├── packages/           # All npm packages
│   └── use-effect-ts/  # React hooks for Effect.TS
└── pnpm-workspace.yaml # Workspace configuration
```

## Contributing

This is a personal repository for my public packages. While not actively seeking contributions, bug reports and suggestions are welcome through GitHub issues.

## License

Each package may have its own license. See the individual package directories for specific licensing information.

## Author

Kishore Polamarasetty

