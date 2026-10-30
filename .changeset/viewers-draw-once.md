---
'@kestack/web-platform': patch
---

The MarkdownViewer draws again only when its text or look changes, and no longer takes down and rebuilds its code blocks on every draw, which highlighted each of them again. The SourceViewer draws its source plain, as tall as it will be, until it is highlighted, highlights one source a task, and remembers the last few hundred it highlighted, so the same source drawn again is highlighted at once.
