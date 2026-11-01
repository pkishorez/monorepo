---
'@kestack/web-platform': patch
---

Faster viewers.

- `MarkdownViewer` redraws only when its text or look changes, and no longer rebuilds and re-highlights its code blocks on every draw.
- `SourceViewer` shows plain source at its final height until highlighting is done, highlights one source per task, and caches the last few hundred results.
