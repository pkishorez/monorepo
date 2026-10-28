---
'@kestack/devtools-kabuki': patch
---

A tab keeps the Kabuki Session name it asked for, not the one DevTools
answered on a clash, so a reload that clashes with its own last socket no
longer moves the tab to `-2`, `-3` for good.
