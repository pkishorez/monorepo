# whatever-code

CLI tool.

## Development

```bash
# From monorepo root
pnpm install
pnpm --filter whatever-code build
```

## Test locally (without publishing)

```bash
# Option 1: Run directly after build
node dist/cli.js

# Option 2: Link globally so `whatever` command works anywhere
cd whatever-code
pnpm link --global

# Now you can run from anywhere
whatever

# To unlink when done
pnpm unlink --global
```
