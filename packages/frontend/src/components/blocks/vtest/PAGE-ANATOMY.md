# VTest doc surfaces — page anatomy

The renderer turns a `VTestReport` into five kinds of pages. Each is driven
purely by markdown the test author writes — there is no schema beyond the
`doc` string. This file is the convention so every page has the same shape.

## Surfaces at a glance

| Field            | Page                | When to write it                         |
| ---------------- | ------------------- | ---------------------------------------- |
| `report.home`    | Package overview    | Always — this is the landing page        |
| `folders[*].doc` | Section overview    | When a directory groups ≥2 modules       |
| `files[*].doc`   | Module / API page   | Always — one per public unit             |
| `suite.doc`      | Suite dialog header | When the suite has a shared theme        |
| `test.doc`       | Suite dialog row    | Always for failing / skipped / RFC tests |

Markdown headings inside each `doc` follow the conventions below. The
renderer does not enforce them — they exist so adjacent pages read the same
way.

---

## Home — `report.home`

The landing page for the whole package. Treat it like the README a new
reader sees first.

**Canonical section order:**

1. One-paragraph elevator pitch (no heading) — what this is, what shape of
   problem it solves, what the smallest sensible building block is.
2. `## Architecture` — usually a `mermaid` diagram showing data flow.
3. `## Install` — single `pnpm add` / `npm i` block.
4. `## Quick start` — 3–5 lines, the most common call form.
5. `## Why another X?` — bullet trade-offs against the alternatives.

The header `# {name}` is stripped by the renderer because the page already
shows the package name as `<h1>`. Start the body at the elevator pitch.

---

## Folder — `folders[*].doc`

Renders for any directory that groups multiple modules. The purpose is
_orientation_ — say what lives here and how the pieces fit, then point at
the modules.

**Canonical section order:**

1. One paragraph (no heading): what this folder is about, and the boundary
   that separates it from sibling folders.
2. `## Modules` — a `Module | Role` table, one row per file in the folder.
3. `## Correctness story` _(optional)_ — only when the section has a
   non-obvious testing strategy (property tests, fuzzing, golden files)
   that's shared across modules. Explain it once here instead of repeating
   it in every module.

---

## File / module — `files[*].doc`

The main reading page for a single API or feature. Follow this order so
readers always know where to look.

**Canonical section order:**

1. Optional frontmatter: `title: ...` overrides the page heading. Defaults
   to the first `# H1` in the body, then to `file.name`.
2. `# {Module name}` — stripped by the renderer (`<h1>` already shown).
3. One-paragraph purpose: what this exports and the shape of input/output.
4. `## Usage` — the single most common call form, copy-pasteable.
5. `## API` or `## Returned shape` — a signature, a small table, or both.
   Prefer a table for enumerable `input → output` mappings.
6. `## Examples` — 2–4 short snippets covering distinct patterns (defaults,
   overrides, composition with other modules). Larger than Usage, smaller
   than a tutorial.
7. `## Edge cases` — bulleted list. Each bullet should match the _name_ of
   a test below so the reader can see the assertion that proves it.
8. `## Open questions` _(optional)_ — RFCs, pending decisions, issue links.

---

## Suite — `suite.doc`

A suite groups tests around a shared theme. The suite doc is the _contract_
the suite collectively proves. It appears in two places:

- A one-line teaser under the suite row on the module page (first
  non-heading, non-code, non-table line).
- The full content at the top of the suite dialog.

**Canonical shape:**

1. One- or two-sentence statement of what behaviour this suite locks down.
2. A bulleted list of invariants & edge cases the suite covers — each
   bullet should match a test name verbatim so the reader can find it.
3. Optional blockquote with any open RFC or pending decision.

Avoid `#` headings inside suite docs — they render inside a dialog where
the suite name is already the heading. Keep it short; the tests are the
detail, the doc is the framing.

---

## Test — `test.doc`

One terse note. The test name is already the behaviour summary; the doc
adds _why_ or _what's unusual_. Always write one for:

- `fail` — what the failure means and what _should_ happen.
- `skip` / `todo` — what's blocking it (link to the RFC or issue).
- Any test whose name doesn't fully describe the assertion.

Keep it to a single line, or two at most. Inline code with backticks. No
headings, no fenced code blocks — the suite dialog already shows the test
snippet beneath the doc.

For passing tests with a self-evident name, omit `doc` entirely — empty is
better than restating the name.

---

## What the renderer does for you

- Strips a leading `# H1` on home / folder / file pages (the page already
  shows the title).
- Renders `mermaid` code blocks as diagrams.
- Renders Prism-highlighted code blocks for any other language.
- Treats GFM tables, blockquotes, and `title:` frontmatter as expected.
- Collapses every suite into one row; the suite dialog is the only place
  test bodies are visible.

## What the renderer will _not_ do

- It will not enforce sections. A missing `## Examples` won't error — it
  just won't render.
- It will not re-order what you wrote. Keep the canonical order above so
  adjacent pages read the same way.
- It will not open a test in its own dialog. If a test needs more than a
  line of context, that context belongs in the **suite** doc, not the
  test doc.
