---
'@kestack/web-platform': patch
---

`MarkdownViewer` draws every code block as a block: a fenced block with no language, and an indented one, no longer show as an inline chip. A code block is a quiet filled box flush with the text's edge, and a long line scrolls sideways inside it rather than spilling out. A table's first column lines up with the text around it.
