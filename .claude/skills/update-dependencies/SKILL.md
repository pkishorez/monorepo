---
name: update-dependencies
description: Update every dependency in the monorepo to its latest version, fix what breaks, and open a PR.
disable-model-invocation: true
---

# Update dependencies

Every external version lives in the default catalog in `pnpm-workspace.yaml`; package.json files say `catalog:`. Exact-pinned peer dependencies are the exception: they live in each package.json, and syncpack's update groups skip them on purpose.

The run is done when the catalog and every pinned peer sit at the newest version that clears the release hold, except for versions deliberately held back, each with its reason written beside it, and the CI gate is green.

## 1. Branch

Branch from the branch the user names (default `main`, pushed first, per `CLAUDE.md`), as `chore/update-dependencies`.

## 2. Update the catalog

Run `pnpm exec syncpack update --dry-run --no-cache` first and read it whole, then `pnpm exec syncpack update` (no `--interactive`, so it runs unattended).

Fill syncpack's gaps:

- **Failed fetches.** Syncpack prints `✗ Failed to fetch <name>` for some large packages (effect, wrangler, react-dom, better-auth, …) and leaves them alone. Look each one up with `npm view <name> dist-tags` and set it by hand.
- **Prerelease lines.** For a package pinned to a prerelease (`alchemy` beta, `drizzle-*` rc, `@distilled.cloud/*` rc), syncpack picks the highest version on any tag, including branch builds like `1.0.0-rc.5-ab785fc`. Pick from the matching dist-tag instead, unless a dependency's peer pins that exact build (see step 4).
- **Lockstep families.** Keep each family on one version: `vite` (the `@voidzero-dev/vite-plus-core` alias) matches `vite-plus`, `vitest` and `@vitest/utils` match what `vite-plus` depends on (`npm view vite-plus@<v> dependencies`), and every `@better-auth/*`, `@effect/*` and `@shikijs/*` matches its family.
- **Pinned peers.** Bump every exact-pinned peer (alchemy, `@tanstack/db`, `@tanstack/react-db`, `@vitejs/plugin-react`, …) to the catalog's new version. Bump the `^x.y.z` floor of a peer whose range names a tested version (`playwright-core`) in both the package.json files and `.syncpackrc.json`.
- **Holds whose reason is gone.** Read every comment in `pnpm-workspace.yaml` and `.syncpackrc.json`. A dated `TEMPORARY` entry past its date comes out; a "before upgrading, run …" note means run that check in step 5.

## 3. Respect the release hold

`minimumReleaseAge: 1440` makes pnpm refuse anything published in the last 24 hours, including a new version's own platform sub-packages, which can land hours after the main package (`sherpa-onnx-node` 2.0.0 did). Syncpack ignores the hold, so `pnpm install` is the judge.

When install refuses a version, step that package back to the newest version older than 24 hours (`npm view <name> time --json`), keeping its family in lockstep. Never add a package to `minimumReleaseAgeExclude` to get past the hold; that list is for a fix the user asks for by name, with a dated removal comment.

## 4. Install until clean

1. `pnpm install`
2. `pnpm dedupe`. Without it the lockfile keeps old transitive resolutions, and two copies of one library (two `@codemirror/state`s broke `apps/code`'s types) fail type-checking.
3. `pnpm peers check`. Each unmet peer is a compatibility limit to obey: pin the catalog to the range the dependent accepts (as with OpenTelemetry 3.x, which `@effect/opentelemetry` does not accept yet), or match an exact peer it pins (as with alchemy's `drizzle-*` build). When a limit will recur, add an `updateGroups` entry to `.syncpackrc.json` whose label names the reason, so the next run doesn't propose the same upgrade again. A peer warning that predates this run and does no harm goes in `peerDependencyRules.allowedVersions` with a one-line reason.

Repeat until install, dedupe and peers check are all clean, then confirm with `pnpm exec syncpack update --dry-run`: anything still listed is held back for a reason you can name.

## 5. Gate

Run exactly what `.github/workflows/test-monorepo.yml` runs, in order: build, lint, the Laymos script, then the tests. The tests need DynamoDB Local on port 8090 (`docker run -d --rm -p 8090:8000 amazon/dynamodb-local:latest`). Then run `pnpm stories`; after a `playwright-core` bump it first needs that version's browser: `pnpm exec playwright-core install chromium-headless-shell` from a package that depends on it.

Every failure is a breaking change to fix at its source, in the package's code. Read the dependency's changelog or upgrade guide for the change behind it before editing. A formatting failure in a file you didn't touch comes from the newer formatter in `vite-plus`: run `pnpm fmt`.

When a fix is impractical, hold that dependency at the last version that passes, with a comment beside it naming what fails and what would unblock it.

## 6. Changeset and PR

Add one changeset bumping `patch` for every published package whose package.json or code changed; say which upgrades a consumer will notice (peer ranges, schema migrations). Commit, push and open the PR against the branch from step 1. The PR body lists each major upgrade, each breaking change and its fix, and each held-back package with its reason.
