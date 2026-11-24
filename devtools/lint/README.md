# @kestack/lint

Oxlint rules that keep a codebase's folders to the Kestack guidelines: what a file may import, and what a contract may export

## Big picture

A codebase stays easy to change when every folder is private and code is
shared only through a few named folders. This package checks that with two
oxlint rules, so `vp check` and `vp lint` catch a wrong import the moment it
is written, with a message that names the fix.

A folder with an index file is a **module**. A file may import any file in
its own module; below it, the index file of any module, at any depth;
beside or above it, only a **door**: the index file of a door folder such as
`logic/shared/`, or of a folder directly inside one. Which folders are doors
is your choice, given as plain options.

The rules know nothing about any one framework. The `kabuki` preset fills
them in for a Kabuki app, following the
[kabuki-guidelines](../../.claude/skills/kabuki-guidelines/SKILL.md) skill.
It is meant to replace [laymos](../laymos/README.md) lint.

## Install

```sh
pnpm add -D @kestack/lint
```

No peer dependencies. It runs inside oxlint, which Vite+ ships.

## Exports

### `@kestack/lint`

| Export    | What it does                                                                                |
| --------- | ------------------------------------------------------------------------------------------- |
| `default` | The oxlint plugin `kestack`, with its two rules, `kestack/imports` and `kestack/contracts`. |

### `@kestack/lint/presets`

| Export   | What it does                                                  |
| -------- | ------------------------------------------------------------- |
| `kabuki` | Both rules set for a Kabuki app's folders, ready for `rules`. |

## Usage

### Check a Kabuki app

Register the plugin and turn the preset on for the app's files.

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';
import { kabuki } from '@kestack/lint/presets';

export default defineConfig({
  lint: {
    jsPlugins: ['@kestack/lint'],
    overrides: [{ files: ['src/app/**'], rules: kabuki }],
  },
});
```

- `kabuki` sets `kestack/imports` with the doors `logic/shared`,
  `view/shared`, `children/shared`, `capabilities/*/contract`,
  `services/*/contract`, `server/rpc/contract`, `server/rpc/*/contract`
  and `http/*/contract`, and skips tests.
- It sets `kestack/contracts` on the same contract folders, and requires
  each `services/<name>/` to have its `contract/`.

### Choose your own doors

Any codebase can name its own door folders. A `*` matches one folder name.

```ts
rules: {
  'kestack/imports': ['error', {
    doors: ['shared', 'ports/*'],
    ignore: ['**/*.test.ts'],
  }],
  'kestack/contracts': ['error', {
    folders: ['ports/*'],
    required: ['ports/*'],
  }],
}
```

- A door is written as a path from the folder that owns it. Files inside
  that owner, at any depth, may import the door's index file.
- A file inside a module below, not its index file, or beside it and not a door,
  is reported with the index file or door to use instead.
