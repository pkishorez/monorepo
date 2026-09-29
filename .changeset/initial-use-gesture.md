---
'@kstackz/use-gesture': patch
'@kstackz/ui-toolkit': patch
---

Initial release: the gestures block moves out of `@kstackz/ui-toolkit` into its own package.

`GestureProvider`, `GestureZone` and `useGesture` now come from `@kstackz/use-gesture`; `@kstackz/ui-toolkit/components/blocks/gestures` is gone. The zone's default styles no longer need Tailwind: they ship as a zero-specificity rule, so any class on the zone still wins.
