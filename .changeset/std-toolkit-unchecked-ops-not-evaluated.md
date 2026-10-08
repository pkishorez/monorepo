---
'@kstackz/std-toolkit': patch
---

A batch that one op refuses before submission now reports every other op as `not-evaluated`. Before, ops ahead of the refusal were reported `passed`, even though their item conditions were never checked, so a stale guard could read as one that held.
