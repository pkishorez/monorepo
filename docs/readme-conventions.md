# README conventions

Every Package (a folder with a `package.json` matched by the workspace globs)
has a `README.md` with exactly these sections, in this order, under these
headings. Nothing else at the top level.

1. `# <package name>` followed by one sentence: the **Signature**. It is the
   same text as the `description` field in `package.json`. Keep them in sync.
2. `## Big picture`: two to four short paragraphs. Why the Package exists,
   which problem it removes, which sibling Packages it builds on or feeds.
   Link `CONTEXT.md`, `docs/adr/`, and any `docs/*.md` here; do not restate
   them.
3. `## Install`: the install line, then every peer dependency with one line on
   why it is needed.
4. `## Exports`: one `###` subsection per subpath in `package.json` `exports`,
   each a two-column table (`Export`, `What it does`). List every runtime value
   the subpath exposes: functions, Services, Layers, Schema values, constants.
   Expand namespace objects one level (`ESchema.make`). Never list types or
   interfaces. One plain sentence per row, no signatures.
5. `## Usage`: one to three use cases. Each has a `###` heading naming the
   scenario, one paragraph, one code block of about 40 lines or fewer lifted
   from a test, story, or demo, then a short "how it works" bullet list.

## Subpath and module READMEs

If a subpath folder has its own `README.md` in this same five-section shape
(as std-toolkit's subpaths do), its Exports live there and the parent lists the
subpath with one line and a link instead.

A module `README.md` that Laymos shows as module documentation is a long-form
guide: it stays where it is, keeps its own shape, and the parent still carries
the full Exports table and links it.

## Private apps

Private apps skip Install and Exports; their Usage says how to run them.

## What does not fit

Warnings and runbooks that do not fit move to `docs/*.md` inside the Package
and are linked from Big picture. Prose that repeats `CONTEXT.md` is cut.
