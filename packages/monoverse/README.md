# Monoverse

A zero-config, opinionated monorepo management tool.

## Getting Started

Monoverse works out of the box with any monorepo. No configuration needed.

```bash
# Install
npm install -g monoverse

# Run from anywhere in your monorepo
monoverse ls
```

Monoverse auto-detects your package manager (pnpm, yarn, npm, bun) and discovers all workspaces automatically.

## Commands

### ls

List all workspaces in a tree structure.

```bash
monoverse ls
```

```
Workspaces (12)

my-monorepo
├── apps
│   ├── web (web)
│   └── mobile (mobile)
└── packages
    ├── ui (@acme/ui)
    └── utils (@acme/utils) (cwd)
```

### add

Add a dependency to the current workspace.

```bash
monoverse add lodash
monoverse add -t dev vitest
monoverse add -v 5.0.0 lodash
```

| Option | Description |
|--------|-------------|
| `-t, --type` | `dependency` (default), `dev`, `peer`, `optional` |
| `-v, --version` | Specific version to install |

Syncs to existing versions in other workspaces when available.

### remove

Remove a dependency from the current workspace.

```bash
monoverse remove lodash
monoverse rm lodash
```

### lint

Check for issues across all workspaces.

```bash
monoverse lint
```

Detects:
- Version mismatches across workspaces
- Unpinned versions (`^1.0.0`, `~1.0.0`)
- Unformatted package.json files
- Duplicate workspace names

### fix

Auto-fix detected issues.

```bash
monoverse fix
monoverse fix -i
```

| Option | Description |
|--------|-------------|
| `-i, --interactive` | Resolve version mismatches interactively |

### format

Format all package.json files.

```bash
monoverse format
```

## Advanced Configuration

For managing multiple monorepos together, create a `monoverse.json`:

```json
{
  "projects": [".", "../other-monorepo", "./packages/*"]
}
```

Accepts direct paths and glob patterns.

## License

MIT
