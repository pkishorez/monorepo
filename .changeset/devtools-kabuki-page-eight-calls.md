---
'@kestack/devtools': patch
---

The Kabuki page reads a Kabuki Session through its eight calls: it places the Inspector from `@kestack/devtools-kabuki/devtools` with the Session's `KabukiSession` from `remote`, and lists the live ones with `dialSessions`. The Inspector there has no Travel the app switch, no Trail and no Stories: picking a Step Time Travels the app, and its World tab runs the app's Fake controls.
