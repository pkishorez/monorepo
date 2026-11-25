# @kestack/monoverse

The rules this monorepo's code follows: the folder rules a package's monoverse.json names, checked by the monoverse lint CLI and by DevTools' Monoverse, and the oxlint rules every file follows

## Big picture

A codebase stays easy to change when every folder is private and code is
shared only through a few named folders. A package says which folders those
are in one `monoverse.json` beside its `package.json`. `monoverse lint`
checks it from the command line, in a commit hook and in CI, and the
Monoverse Tool in [@kestack/devtools](../devtools/README.md) marks the same
problems on the package's folder tree, through the same functions. A
package without a `monoverse.json` is not checked.

A folder with an index file is a **module**. A file may import any file in
its own module; below it, the index file of any module, at any depth;
beside or above it, only a **door**: the index file of a door folder such as
`logic/shared/`, or of a folder directly inside one. A package can let a
few imports through with `exceptions`, and refuse more with
`restrictions`, each with its reason.

Every import is followed the way TypeScript and Node follow it: relative
paths, `.js` written for `.ts`, folder index files, tsconfig `paths`
(through `extends` and `references`), package.json `imports` (`#name`), and
a package naming itself. A tsconfig that cannot be read, such as one that
extends a package not installed, is passed over. Any import that lands on a file of the same
package is judged, in an `import`, an `export … from` or an `import()` of
a string literal, type-only ones included. A file in another package,
nested ones included, or in `node_modules`, is not.

The `kabuki` preset fills the doors in for a Kabuki app, following the
[kabuki-guidelines](../../.claude/skills/kabuki-guidelines/SKILL.md) skill.
It is meant to replace [laymos](../laymos/README.md) lint.

It also holds the oxlint rules the code inside each file follows, such as
`no-comments`, so every rule this monorepo adopts lives in one package. Why
each rule is on, and which were weighed and left off, is in
[docs/lint-rules.md](docs/lint-rules.md).

## Install

```sh
pnpm add -D @kestack/monoverse
```

- `@oxlint/plugins` (optional): the types of `@kestack/monoverse/oxlint`, for a config written in TypeScript.

## Exports

### `@kestack/monoverse`

| Export             | What it does                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `openProject`      | Opens a folder and its list of files: checks packages and lists each file's imports, parsing a file once.   |
| `checkProject`     | Checks every package with a `monoverse.json`, or the ones named, and reports each package's problems.       |
| `configFile`       | The file name, `monoverse.json`.                                                                            |
| `parseConfig`      | Reads a `monoverse.json`'s text into its settings, with the preset expanded, or says what is wrong.         |
| `presets`          | The ready-made rules, `default` and `kabuki`.                                                               |
| `isChecked`        | Whether a package checks a file: inside a source root, not a declaration or minified file, and not ignored. |
| `matches`          | Whether a glob matches a path, a folder or package name covering everything inside it.                      |
| `sourceExtensions` | The extensions of the files the rules read.                                                                 |
| `isSource`         | Whether a file has one of those extensions.                                                                 |
| `listTree`         | Reads modules and packages from a list of files.                                                            |
| `indexFiles`       | The file names that make a folder a module.                                                                 |
| `isIndexFile`      | Whether a file is a module's index file.                                                                    |
| `isInside`         | Whether a path sits strictly inside a folder.                                                               |
| `parentOf`         | The folder holding a path.                                                                                  |
| `joinPath`         | A name inside a folder.                                                                                     |
| `relativeTo`       | A path as seen from a folder that holds it.                                                                 |

### `@kestack/monoverse/oxlint`

| Export    | What it does                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------- |
| `default` | The oxlint JS plugin `monoverse`, with its `no-comments` rule.                                    |
| `rules`   | Every oxlint rule this monorepo turns on, plugin and built-in, each set to `error`, to spread in. |

### `@kestack/monoverse/schema.json`

The JSON Schema of `monoverse.json`, for its `$schema`.

## Usage

### Lint a repository

Give a package a `monoverse.json`, then run `monoverse lint`. Inside a
package it checks that package; anywhere else in the repository, every
workspace package with a `monoverse.json`. `--staged` checks only the
packages that hold a staged file, each one whole, for a commit hook.

```json
{
  "$schema": "./node_modules/@kestack/monoverse/schema.json",
  "sourceRoots": ["src"],
  "ignore": ["**/tests/**", "**/*.test.ts"],
  "preset": "kabuki"
}
```

```text
$ monoverse lint
packages/invalid
  packages/invalid/monoverse.json:1:1  monoverse.json needs exactly one of "preset" and "rules".

packages/web
  packages/web/src/start.ts:1:22  './feature/part.ts' reaches inside src/feature. Import src/feature through its index file, and export what you need from there.

monoverse: 2 problems in 2 of 2 packages.
```

- `sourceRoots` are the folders checked, relative to the package; `"."`
  is the whole package. `ignore` are globs of files skipped.
- Give exactly one of `preset` and `rules`. Any other key is an error, and
  a broken `monoverse.json` is told once, on itself.
- `default` has one door, `shared`. `kabuki` has the doors `logic/shared`,
  `view/shared`, `children/shared`, `capabilities/*/contract`,
  `services/*/contract`, `server/rpc/contract`, `server/rpc/*/contract` and
  `http/*/contract`, and requires each `services/<name>/` to have its
  `contract/`, which exports only `Context.Service` and error classes as
  values.
- Paths are printed from where it runs, so a terminal can open them. It
  exits 1 on any problem.
- With `--staged`, the files and their text are the index's, what the
  commit will hold, so a file staged in part is judged as staged. Imports
  are still resolved on the disk, so a target must also be there.
- At the root, the workspace packages are the `packages` of
  `pnpm-workspace.yaml`, else the `workspaces` of `package.json`; when
  neither names any, every package is.

### Let an import through, or refuse one

Every glob is relative to the package, and a folder covers everything
inside it. An exception lifts what the imports rule refuses; a restriction
refuses more, and no exception lifts it. This is DevTools' own.

```json
{
  "sourceRoots": ["src"],
  "ignore": ["**/tests/**", "**/*.test.ts", "**/*.test.tsx"],
  "preset": "kabuki",
  "exceptions": [
    {
      "from": "src/cli/serve/",
      "to": "src/app/*/server/index.ts",
      "reason": "The CLI hosts every Tool's server: it is the one place that puts them together."
    }
  ],
  "restrictions": [
    {
      "from": "src/**/logic/**",
      "to": "react",
      "reason": "logic/ is pure and imports no React; components go in view/."
    }
  ]
}
```

- A restriction's `to` is a path in the package when the import lands on
  one, and otherwise the import as written: `"react"` covers `react` and
  `react/jsx-runtime`, and `"@effect/*"` every `@effect` package.
- An exception that lets nothing through, and a restriction whose `from`
  covers no checked file, are problems too, told once on the
  `monoverse.json`, so neither outlives the code it was written for.

### Check from a tool

A tool that knows a folder and its files, as DevTools does, opens it once,
then checks its packages and draws its imports from the same parse.

```ts
import { openProject } from '@kestack/monoverse';

// files: relative to root, as git lists them (tracked, and new ones not ignored)
const project = openProject({ root: '/repo', files });

for (const { path, result } of project.check()) {
  if (result._tag === 'Invalid') console.log(result.file, result.message);
  if (result._tag === 'Checked')
    for (const v of result.violations)
      console.log(`${v.file}:${v.line}:${v.column} ${v.kind} ${v.message}`);
}

project.importsOf('alias/src/start.ts');
// [{ specifier: '@/feature/index.ts', target: 'alias/src/feature/index.ts', line: 1, column: 22 }, …]
```

- `check({ packages })` checks only the packages named; one without a
  `monoverse.json` comes back `Unchecked`.
- A Violation's `kind` is `inside`, `door`, `contract`, `restriction`,
  `unused-exception` or `stale-restriction`; `to` is the file imported,
  when there is one.
- Imports are resolved on the disk under `root`, and only a file in
  `files` is a target. `read` may hand over each file's text instead of
  the disk.

### Turn on the oxlint rules

Load the plugin in a Vite+ `lint` config and spread `rules` over the files that
follow them. This is the monorepo's root `vite.config.ts`.

```ts
import { defineConfig } from 'vite-plus';
import { rules as monoverseRules } from './devtools/monoverse/src/oxlint/index.ts';

export default defineConfig({
  lint: {
    jsPlugins: [
      {
        name: 'monoverse',
        specifier: './devtools/monoverse/src/oxlint/index.ts',
      },
    ],
    options: { reportUnusedDisableDirectives: 'warn' },
    overrides: [
      {
        files: ['devtools/devtools/**', 'devtools/monoverse/**'],
        rules: monoverseRules,
      },
    ],
  },
});
```

```text
src/start.ts:3:1: error monoverse(no-comments): Comments are not allowed. Say it in code (a name, a type, a test), or move the note to this package's docs/.
```

- Outside this repository, the specifier is `@kestack/monoverse/oxlint`, and
  `rules` comes from the same import.
- `no-comments` lets through only what a tool reads: `oxlint-disable…` with
  the rules named and a reason after `--`, `@ts-expect-error`, `/// <reference>`,
  bundler hints and a shebang. It has no autofix, and cannot itself be turned
  off.
- The plugin must be named `monoverse`, the prefix `rules` uses.
