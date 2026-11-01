---
'@kestack/web-platform': patch
---

Markdown and code are quicker to draw.

- `MarkdownViewer` parses and draws its text one top-level block at a time, and redraws a block only when its own text changes. Words streaming in at the end re-parse just the last block, however long the text is. A block is only cut where one surely starts, and text with link references or footnotes is kept whole.
- `SourceViewer` uses Shiki's JavaScript regex engine instead of Oniguruma's WebAssembly, so the roughly 230 KB WebAssembly file is no longer downloaded.
- It highlights once for both themes: a single GitHub theme whose colours are CSS variables, with their light and dark values in `shiki.css`. Highlighting is 2 to 6 times quicker with the same colours. The `--shiki-dark` variable is gone.
