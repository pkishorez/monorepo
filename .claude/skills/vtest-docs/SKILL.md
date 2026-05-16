---
name: vtest-docs
description: Generates and updates vtest test+doc files for a package's public API in the private-monorepo. Auto-detects skeleton vs module mode, proposes a topic-grouped folder tree, and drafts per-module `*.test.ts` + `*.doc.md` files using the PAGE-ANATOMY conventions. Use when the user wants to author or extend vtest documentation, runs /vtest-docs, asks to generate docs for a module, or wants to add a home/folder prose pass.
---

# vtest-docs

User-invoked only. Run inside a package directory that has already been through `/vtest-setup`. Drafts files in `vtest/`; the user reviews in their editor.

## Preflight

1. Confirm cwd has `package.json`, `vitest.docs.config.ts`, `vtest/`, and `scripts.docs`.
2. If any are missing, abort: "run /vtest-setup in this package first."
3. Read `package.json` to know `name`, `description`, `main`/`exports.`.

## Mode detection

Inspect `vtest/`:

| State                                             | Mode             |
| ------------------------------------------------- | ---------------- |
| Only `home.md` (no folders, no `.test.ts` files)  | **Skeleton**     |
| Has folders/test files; user invoked with no args | **Next module**  |
| User named a module that has no files             | **Named module** |
| User named a module that has files                | **Regenerate**   |
| User invoked with `home`                          | **Home prose**   |
| User invoked with `folder <name>`                 | **Folder prose** |

## Skeleton mode

1. Resolve the package's public surface: read `exports.` and `main` from `package.json` → list source files → collect named exports.
2. Classify each export:
   - **function-pure** — top-level function, no JSX return, doesn't start with `use`, no obvious side effects (fs, network, db, global state).
   - **component** — returns JSX or imports from `react`.
   - **hook** — name starts with `use`.
   - **class** — `class` keyword.
   - **type-only** — `type`/`interface` export.
   - **other** — anything else (side-effectful, async generators, etc).
3. Propose a **topic-grouped** folder tree (NOT 1:1 with `src/`). Group related functions semantically. Skipped categories listed below the tree with reasons. Example output:

   ```
   Proposed vtest tree:

   vtest/
     strings/
       case.{test.ts,doc.md}      ← camel, pascal, kebab, snake
       slugify.{test.ts,doc.md}   ← slugify
     numbers/
       clamp.{test.ts,doc.md}     ← clamp, clampInt
     ...

   Skipped (not a vtest fit):
   - <Button> (component) — use cosmos instead
   - useDebounce (hook) — needs renderer
   - DbClient (class, side-effects) — author manual tests
   ```

4. Ask user to confirm or adjust the tree (plain text in chat). Accept edits like "merge clamp and lerp under numbers/range" or "drop parser/, add it later".
5. On confirm: create the proposed folders with one empty `index.doc.md` per folder, each containing a checklist comment of the modules planned for it:

   ```md
   <!--
   modules to document:
   - [ ] case
   - [ ] slugify
   -->
   ```

   Never touch existing files. Skip files already on disk.

6. Tell user: "skeleton written. Run /vtest-docs again to fill in the next module."

## Next module / Named module mode

Pick the target: in "next" mode, scan checklists for the first `[ ]` entry that has no corresponding `.test.ts` file. In "named" mode, use the user-provided slug.

For the chosen module:

1. Read PAGE-ANATOMY at `packages/frontend/src/components/blocks/vtest/PAGE-ANATOMY.md`. The module page section order is canonical.
2. Read source, jsdoc, any same-package unit tests, callsites elsewhere in the monorepo (grep for the export name).
3. Draft `<folder>/<name>.doc.md` following PAGE-ANATOMY's module surface:
   - One-paragraph purpose
   - `## Usage` — most common call form
   - `## API` — signature or input/output table
   - `## Examples` — 2–4 distinct patterns
   - `## Edge cases` — bulleted; each bullet matches a `vtest` name below
   - Optional `## Open questions`
4. Draft `<folder>/<name>.test.ts` using `@monorepo/vtest`:

   ```ts
   import { expect } from 'vitest';

   import { vdescribe, vtest } from '@monorepo/vtest';
   import { <fn> } from '<pkg-name>';
   ```

   Import targets from the **public entry** (`<pkg-name>`), never relative `../src/...`. If the target isn't exported, stop and ask: "this function isn't public — export it or skip?"

   Use `vdescribe` per logical group; each `vtest` name should match an Edge-cases bullet verbatim. Look at `packages/frontend/vtest/strings/case.test.ts` for the canonical style.

5. Write both files. Update the parent folder's `index.doc.md`:
   - Tick the checklist item.
   - Append a row to (or create) the `## Modules` table:
     ```md
     | Module                | Role                                          |
     | --------------------- | --------------------------------------------- |
     | [case](./case.doc.md) | Case conversions: camel, pascal, kebab, snake |
     ```
6. Update `vtest/home.md`'s `## Modules` bullet list to include this folder if it isn't there yet (one bullet per folder, derived from filesystem).
7. Tell user the paths they should review in their editor. Targeted follow-up questions ONLY for genuine unknowns (pending RFCs, intentional `skip`/`todo` tests).

## Regenerate mode

User explicitly named a module that already has files.

1. Draft new versions exactly as in "Named module".
2. Show a **diff** vs existing (use bash `diff -u` or present hunks inline).
3. Ask: keep existing / replace entirely / merge specific sections (user names sections).
4. Apply chosen action. Never blast over hand-edits silently.

## Home prose mode

User invoked `/vtest-docs home`.

1. Read PAGE-ANATOMY's Home section.
2. Read package source + all existing `vtest/*/index.doc.md` for grounding.
3. Draft full `home.md`: elevator pitch, `## Architecture` (mermaid), `## Install`, `## Quick start`, `## Why another X?`.
4. Show as preview in chat (it's small enough). Ask: accept / edit / redo with notes.
5. Write on accept, preserving the auto-maintained `## Modules` list.

## Folder prose mode

User invoked `/vtest-docs folder <name>`.

1. Read PAGE-ANATOMY's Folder section.
2. Read all modules under that folder for grounding.
3. Draft folder boundary paragraph + optional `## Correctness story`. Preserve the auto-maintained `## Modules` table and the checklist comment.
4. Preview → accept/edit → write.

## Existing-file safety

Never overwrite silently. The matrix:

| Mode         | Existing file action                     |
| ------------ | ---------------------------------------- |
| Skeleton     | Skip (don't touch)                       |
| Next module  | Skip target, move to next checklist item |
| Named module | Switch to regenerate mode (diff first)   |
| Regenerate   | Diff + user choice                       |
| Home/folder  | Diff + user choice                       |

Auto-maintained sections (`## Modules` table in folder index, home modules bullets) ARE updated mechanically on every module write — these are deterministic from filesystem state, no judgment, safe to refresh.

## Scope discipline

- **Pure functions only** by default. Components/hooks/classes/side-effectful → "skipped" with reason.
- **Topic-grouped tree**, not src/ mirror.
- **Public-entry imports**, never relative `../src/...`.
- **Per-package only** — abort if not inside a package directory.

## Reference files

- API: `packages/vtest/src/index.ts` (`vdescribe`, `vtest`)
- Reporter behavior: `packages/vtest/src/reporter.ts`
- **Doc style guide** (canonical): `packages/frontend/src/components/blocks/vtest/PAGE-ANATOMY.md`
- Worked example: `packages/frontend/vtest/` (especially `strings/case.test.ts` and `strings/case.doc.md`)
