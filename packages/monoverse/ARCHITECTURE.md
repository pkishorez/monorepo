# Architecture

## Stack

- Effect TS for everything
- Bun runtime
- opentui for terminal UI

## Structure

```
src/
  core/
    fs/           # Filesystem utilities (read, glob, exists)
    fetch/        # NPM registry API clients
    monorepo/     # Monorepo analysis (PM detection, package discovery)
    semver/       # Semver utilities (normalization, validation)
  cli.tsx         # CLI entry point (React-based TUI)
  test.ts         # Manual test runner
```

## Decisions

### Build Tools (Vite + Nodemon)

- **Vite**: Properly handles peer dependencies. With the multi-repo approach (separating private and public packages), peer dependency resolution with direct bun or node is broken under pnpm. Vite resolves this.
- **Nodemon**: `bun --watch` causes issues where the app doesn't properly restart since this is a TUI app. Nodemon provides reliable restarts.

### npm-pkg

- Use abbreviated endpoint (`application/vnd.npm.install-v1+json`) for ~95% bandwidth reduction
- Read latest version from `dist-tags.latest` (reliable for all normally published packages)

### npm-pkg-details

- Use `/package/latest` endpoint for detailed metadata (description, maintainers, license, etc.)

### npm-downloads

- Use npm downloads API (`api.npmjs.org/downloads/point`) for download stats
- Supports periods: last-day, last-week, last-month

### monorepo/analyze

- Walks up from any directory to find monorepo root (workspace config or package.json)
- Detects PM via lock files: pnpm-lock.yaml → yarn.lock → package-lock.json → bun.lockb
- Reads workspace patterns from pnpm-workspace.yaml or package.json workspaces field
- Collects errors without failing fast; invalid package.json files are reported, not fatal

### semver/normalizeSemver

- Takes a version range, returns the pinpointed minimum version
- Uses `semver` npm package for validation and normalization
- Returns `InvalidSemverRangeError` for non-semver inputs (workspace:, file:, git, etc.)
