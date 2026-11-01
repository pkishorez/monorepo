---
'@kestack/web-platform': patch
---

Markdown and code draw faster. **Breaking** for custom Shiki styles: `--shiki-dark` is gone.

**New**

- `MarkdownViewer` parses and draws one top-level block at a time. Streamed text re-parses only the last block.
- `MarkdownViewer` takes `block` (wrap each block) and `from` (skip earlier blocks), for drawing long text in parts. `blocksOf` is exported.
- `SourceViewer` uses Shiki's JavaScript regex engine, so the ~230 KB WebAssembly file is no longer downloaded.
- One highlight pass covers both themes: colours are CSS variables, with light and dark values in `shiki.css`. Highlighting is 2 to 6 times faster.
