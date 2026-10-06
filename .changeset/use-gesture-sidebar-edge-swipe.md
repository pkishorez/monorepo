---
'@kstackz/use-gesture': patch
---

A one-finger swipe from a Sidebar's edge strip always moves the Sidebar, even over a zone inside that wants the same Direction, such as swipeable tabs. The strip is 24px, or `edge` when set. A touch of more fingers there is still left to the zones. See ADR 0015.
