---
'laymos': patch
'@kstackz/devtools': patch
---

Stories are rebuilt. A Story is one claim in one file: a Preparation, an Action, and a Verification, with no relative imports. `Story.make` runs in the process and keeps a trace and each phase's value as Evidence. `Story.browser` runs the Story's own page in Chromium on desktop or mobile Devices with several Tabs. It records every Tab's screen as raw frames, with an animated pointer, finger dots for multi-touch Gestures, and key badges. Clusters are the folders under the Stories path. Each run replaces a Story's report in `.laymos/stories/`. `laymos lint` flags a Story that is not Self-contained. The DevTools Stories tab is now a canvas of Clusters and cards, and opening a Story shows its file, phases, trace, and Recordings on one timeline. Question-based Stories, Story Groups, pages, support files and `Story.flow` are removed.
