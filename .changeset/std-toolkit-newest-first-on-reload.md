---
'@kstackz/std-toolkit': patch
---

`strategy.newToOld` reads the newest page first on every open, not only the first. After a reload it keeps that page as a stretch of its own above the saved ones, shows it at once, and fills the hole between them before reading further back. Before, a reload paged upward through everything missed while away, so today's records showed last.
