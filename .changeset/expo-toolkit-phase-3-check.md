---
'@kstackz/expo-platform': patch
---

Two fixes found driving Ledger on a phone:

- `Dialog` rises above the keyboard, so a dialog with fields (as `LocalSignIn`) no longer hides its lower fields and buttons behind it.
- `Swipe` arms a full swipe by how far the finger dragged, not by the rubber-banded row: with an 80-point tile the old line needed more drag than a phone is wide, so `SwipeRow` could never delete by swiping.
