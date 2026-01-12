# Monoverse

A powerful monorepo management tool to streamline your development workflow.

## Installation

```bash
npm install -g monoverse
# or
pnpm add -g monoverse
```

## Quick Start

```bash
# List all workspaces in a tree view
monoverse ls

# Check for issues
monoverse lint

# Auto-fix issues
monoverse fix
```

## Configuration

Create a `monoverse.json` file in your project root to manage multiple monorepos or custom project structures:

```json
{
  "projects": [".", "../other-monorepo", "./packages/*"]
}
```

The `projects` array accepts:

- **Direct paths**: `"."`, `"../other-repo"`
- **Glob patterns**: `"./packages/*"`, `"./apps/**"`

Monoverse will discover all workspaces from the specified paths and manage them together.

## Commands

### `monoverse ls`

Display all workspaces in a tree structure. Shows the folder hierarchy with package names and highlights your current working directory.

```
Workspaces (23)

MINE
├── private-monorepo (private-monorepo)
│   ├── apps
│   │   ├── docs (docs)
│   │   └── kishore-app (kishore-app)
│   └── packages
│       └── shadcn (@monorepo/shadcn)
└── monorepo (public-monorepo)
    └── packages
        └── monoverse (monoverse) (cwd)
```

### `monoverse add <package>`

Add a dependency to the current workspace.

```bash
# Add as regular dependency
monoverse add lodash

# Add as dev dependency
monoverse add -t dev vitest

# Add with specific version
monoverse add -v 5.0.0 lodash
```

**Options:**

- `-t, --type` - Dependency type: `dependency` (default), `dev`, `peer`, `optional`
- `-v, --version` - Specific version to install

**Smart version resolution:**

- If the package exists in other workspaces, monoverse syncs to that version
- If multiple versions exist, you'll be prompted to choose
- Otherwise, fetches the latest version from npm

### `monoverse remove <package>`

Remove a dependency from the current workspace.

```bash
monoverse remove lodash

# Aliases
monoverse rm lodash
monoverse delete lodash
```

### `monoverse lint`

Check all workspaces for issues. Returns exit code 1 if issues are found.

```bash
monoverse lint
```

**Detects:**

- **Version mismatches** - Same package with different versions across workspaces
- **Unpinned versions** - Dependencies using ranges like `^1.0.0` or `~1.0.0`
- **Formatting issues** - package.json files not properly formatted
- **Duplicate workspaces** - Multiple workspaces with the same name

### `monoverse fix`

Automatically fix detected issues.

```bash
# Auto-fix formatting and unpinned versions
monoverse fix

# Interactive mode - also resolve version mismatches
monoverse fix -i
```

**Options:**

- `-i, --interactive` - Interactively resolve version mismatches by selecting which version to use

**Fixes automatically:**

- Formatting issues (sorts package.json)
- Unpinned versions (converts `^1.2.3` to `1.2.3`)

**Requires interactive mode:**

- Version mismatches (you choose which version to keep)

### `monoverse format`

Format all package.json files in the monorepo.

```bash
monoverse format
```

Sorts keys in a consistent order and ensures proper formatting.

### `monoverse tui`

Launch the terminal user interface (coming soon).

## Supported Package Managers

Monoverse auto-detects your package manager:

- **pnpm** - `pnpm-workspace.yaml`
- **yarn** - `package.json` workspaces field
- **npm** - `package.json` workspaces field
- **bun** - `package.json` workspaces field

## License

MIT
