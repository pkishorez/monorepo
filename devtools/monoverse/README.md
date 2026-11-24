# @kestack/monoverse

The folder rules a package's monoverse.json names, checked by oxlint as you write and by DevTools' Monoverse on every branch

## Big picture

A codebase stays easy to change when every folder is private and code is
shared only through a few named folders. A package says which folders those
are in one `monoverse.json` beside its `package.json`, and the same rules
run in two places: oxlint, so `vp check` and `vp lint` catch a wrong import
the moment it is written, and the Monoverse Tool in
[@kestack/devtools](../devtools/README.md), which marks every broken import
on the package's folder tree. A package without a `monoverse.json` is not
checked.

A folder with an index file is a **module**. A file may import any file in
its own module; below it, the index file of any module, at any depth;
beside or above it, only a **door**: the index file of a door folder such as
`logic/shared/`, or of a folder directly inside one.

Only relative imports are judged: `./x` and `../x`, in an `import`, an
`export … from`, or an `import()` of a string literal. A package name, a
`#name` from package.json `imports`, and a tsconfig `paths` alias never
are, nor is a file in another package, nested ones included.

The `kabuki` preset fills the doors in for a Kabuki app, following the
[kabuki-guidelines](../../.claude/skills/kabuki-guidelines/SKILL.md) skill.
It is meant to replace [laymos](../laymos/README.md) lint.

## Install

```sh
pnpm add -D @kestack/monoverse
```

No peer dependencies. The plugin runs inside oxlint, which Vite+ ships.

## Exports

### `@kestack/monoverse`

The rules with no oxlint in them, for a tool that reads a whole branch.

| Export             | What it does                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `configFile`       | The file name, `monoverse.json`.                                                                    |
| `parseConfig`      | Reads a `monoverse.json`'s text into its settings, with the preset expanded, or says what is wrong. |
| `presets`          | The ready-made rules, `default` and `kabuki`.                                                       |
| `isChecked`        | Whether the rules check a file: inside a source root, not a declaration file, and not ignored.      |
| `importOf`         | The import an ESTree node makes, when the imports rule reads it.                                    |
| `importsIn`        | Every import a parsed file makes that the imports rule reads, in source order.                      |
| `resolveRelative`  | The file a relative import names, asking a function whether a file is there.                        |
| `isRelative`       | Whether the rules follow a specifier.                                                               |
| `sourceExtensions` | The extensions of the files the rules read.                                                         |
| `judgeImport`      | Whether one file may import another under the imports rule, and if not, why.                        |
| `checkImport`      | `judgeImport`, but only for a file its package checks and with the rule on.                         |
| `importMessage`    | The words a broken import is told, with the fix.                                                    |
| `contractFindings` | What the contracts rule finds in one parsed file: a missing contract, or a wrong export.            |
| `contractOf`       | The contract folder holding a file, if any.                                                         |
| `missingContract`  | The folder holding a file that lacks a contract the rules require.                                  |
| `contractMessages` | The words each broken contract is told.                                                             |
| `contractClass`    | What a contract may extend to export a class as a value.                                            |
| `diskTree`         | Reads modules and packages from the disk, for absolute paths, again whenever a folder changes.      |
| `listTree`         | Reads modules and packages from a list of files, such as the ones git knows at a branch.            |
| `indexFiles`       | The file names that make a folder a module.                                                         |
| `isIndexFile`      | Whether a file is a module's index file.                                                            |
| `isInside`         | Whether a path sits strictly inside a folder.                                                       |
| `parentOf`         | The folder holding a path.                                                                          |
| `joinPath`         | A name inside a folder.                                                                             |
| `relativeTo`       | A path as seen from a folder that holds it.                                                         |

### `@kestack/monoverse/oxlint`

| Export    | What it does                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------- |
| `default` | The oxlint plugin `monoverse`, with `monoverse/imports` and `monoverse/contracts`, no options. |

### `@kestack/monoverse/schema.json`

The JSON Schema of `monoverse.json`, for its `$schema`.

## Usage

### Check a package

Turn the plugin on once, for the whole repository, then give each package
to check its `monoverse.json`.

```ts
// vite.config.ts, at the repository root
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    jsPlugins: ['@kestack/monoverse/oxlint'],
    rules: {
      'monoverse/imports': 'error',
      'monoverse/contracts': 'error',
    },
  },
});
```

```json
{
  "$schema": "./node_modules/@kestack/monoverse/schema.json",
  "sourceRoots": ["src"],
  "ignore": ["**/tests/**", "**/*.test.ts"],
  "preset": "kabuki"
}
```

- `sourceRoots` are the folders checked, relative to the package; `"."`
  is the whole package. `ignore` are globs of files skipped.
- Give exactly one of `preset` and `rules`. Any other key is an error, and
  a broken `monoverse.json` is reported on every file of its package.
- `default` has one door, `shared`. `kabuki` has the doors `logic/shared`,
  `view/shared`, `children/shared`, `capabilities/*/contract`,
  `services/*/contract`, `server/rpc/contract`, `server/rpc/*/contract` and
  `http/*/contract`, and requires each `services/<name>/` to have its
  `contract/`.
- Each file is checked by the `monoverse.json` of its nearest
  `package.json`, so `vp lint` at the root checks every package, and inside
  a package only that package. A package whose own `vite.config.ts` has a
  `lint` section must turn the plugin on there too.

### Choose your own doors

Instead of a preset, a package names its own rules. A `*` matches one folder
name; a rule left out is off.

```json
{
  "sourceRoots": ["src"],
  "rules": {
    "imports": { "doors": ["shared", "ports/*"] },
    "contracts": { "folders": ["ports/*"], "required": ["ports/*"] }
  }
}
```

- A door is written as a path from the folder that owns it. Files inside
  that owner, at any depth, may import the door's index file.
- A file inside a module below, not its index file, or beside it and not a
  door, is reported with the index file or door to use instead.

### Judge a branch

A tool that knows a branch's files and can parse them, as Monoverse does,
runs the same rules with no disk, and finds what the lint finds: the same
statements, resolved the same way, with the same words.

```ts
import { parseSync } from 'oxc-parser';
import {
  contractFindings,
  importMessage,
  importsIn,
  isChecked,
  judgeImport,
  listTree,
  parseConfig,
  resolveRelative,
} from '@kestack/monoverse';

const tree = listTree(files); // every file git knows, relative to the root
const result = parseConfig(text); // apps/web/monoverse.json
const rule = result.ok ? result.config.rules.imports : undefined;
const file = 'apps/web/src/main.ts';
if (result.ok && rule && isChecked(result.config, 'src/main.ts')) {
  const { program } = parseSync(file, source);
  const exists = (path: string) => files.includes(path);
  for (const { specifier } of importsIn(program)) {
    const target = resolveRelative(file, specifier, exists);
    if (target === undefined) continue;
    const verdict = judgeImport(tree, rule, file, target);
    if (!verdict.ok) console.log(importMessage(verdict, specifier, 'apps/web'));
  }
}
```

- `listTree` makes a folder a module when the list holds its index file,
  and a package when it holds its `package.json`.
- `contractFindings` reads the same parsed file for the contracts rule.
