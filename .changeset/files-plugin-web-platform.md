---
'@kestack/web-platform': patch
---

`MarkdownViewer` can draw an image itself, and the image viewer has a sibling for every other kind of file.

**Added**

- `MarkdownViewer` takes `image`, which draws each image given its address as written, its alt text and title, and `MarkdownImage`, the type it is handed.
- `Viewer`, from `./recipes/image-viewer`: the same immersive overlay as `ImageViewer`, for anything that is not an image, with a caption, a detail line and tools of its own.
- `ViewerTool`, the round button on a viewer's bar, and `VIEWER_SURFACE`, the rounded edge and shadow a viewer's content sits on.
- `ImageViewer` takes `caption`, `detail` and `tools`, and fades in as it opens unless motion is reduced.
