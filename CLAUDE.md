# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is Kishore's personal TypeScript monorepo for all public-facing npm packages. It's managed with pnpm workspaces and uses modern ESM modules with TypeScript 5.9.2. The repository hosts multiple packages for open-source distribution, starting with use-effect-ts and expanding to include other public packages over time.

## Commands

### General Package Development
```bash
# Build a specific package
pnpm --filter <package-name> build

# Type check a specific package
pnpm --filter <package-name> lint

# Watch mode for development
pnpm --filter <package-name> dev

# Run tests for a package (when test setup exists)
pnpm --filter <package-name> test
```

### Workspace Management
```bash
# Install dependencies for all packages
pnpm install

# Build all packages
pnpm -r build

# Run any command across all packages
pnpm -r <command>

# Add a new dependency to a specific package
pnpm --filter <package-name> add <dependency>

# Add a new dev dependency
pnpm --filter <package-name> add -D <dependency>
```

### Creating New Packages
```bash
# Create new package directory
mkdir packages/<package-name>
cd packages/<package-name>

# Initialize package
pnpm init

# Set up TypeScript
pnpm add -D typescript @tsconfig/node22
```

## Architecture

### Monorepo Structure
```
monorepo/
├── packages/              # All public npm packages
│   ├── use-effect-ts/     # React hooks for Effect.TS
│   └── [future-packages]/ # Additional packages as created
├── pnpm-workspace.yaml    # Workspace configuration
└── package.json           # Root configuration
```

### Current Packages
- **packages/use-effect-ts**: React hooks library bridging React components with Effect.TS
  - Provides lifecycle-aware hooks for Effect computations
  - Exports: useComponentScope, useRunEffect, useRunEffectLatest, useRunEffectQueue, useComponentLifecycle, useLiveRef
  - Peer dependencies: React 19.1.1+, Effect 3.17.4+

### Technical Stack
- **TypeScript**: Strict mode with Node.js 22 configuration
- **Module System**: ESM modules with explicit export maps
- **Package Manager**: pnpm with workspace support
- **Build Output**: TypeScript compilation to dist/ with declaration files
- **Package Scope**: @kishore-monorepo/* for npm publishing

### Development Patterns
- All source code in `src/` directories
- TypeScript compilation outputs to `dist/`
- Each package maintains its own dependencies and configuration
- Consistent TypeScript configuration extending @tsconfig/node22
- Modern ESM module configuration with Node.js module resolution
- Packages should be independently publishable to npm

## Key Considerations

### When Adding New Packages

1. **Consistent Structure**: Follow the existing package structure with src/, dist/, and proper TypeScript configuration
2. **Package Naming**: Use @kishore-monorepo/* scope for all packages
3. **Documentation**: Each package should have its own README.md with usage examples
4. **Licensing**: Include appropriate LICENSE file in each package
5. **Export Maps**: Configure explicit export maps in package.json for clean imports

### Development Best Practices

1. **TypeScript Configuration**: Always extend @tsconfig/node22 with strict settings for type safety
2. **Module System**: Use ESM modules ("type": "module") for all new packages
3. **Peer Dependencies**: Use peer dependencies for framework dependencies to avoid version conflicts
4. **Build Process**: Simple TypeScript compilation to dist/ without bundling for library packages
5. **Version Management**: Consider using changesets for coordinated version management across packages

### Current Limitations

1. **No Test Framework**: Testing setup needs to be added (consider Vitest for ESM compatibility)
2. **No Linting**: ESLint and Prettier configurations should be added at root level
3. **No CI/CD**: GitHub Actions workflow for testing and publishing needs to be set up
4. **No Bundling**: Consider adding bundling for packages that would benefit from it

### Package-Specific Notes

**use-effect-ts**: When modifying Effect.TS hooks, ensure proper fiber and scope management. Always clean up resources in React lifecycle hooks.