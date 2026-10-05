---
'@kstackz/use-gesture': patch
---

A Gesture no longer outlives its fingers. A finger's lift is heard on the element it landed on too, so it ends the Gesture even after that element has left the page, as iOS sends it there. And a touch that finds fewer fingers on the screen than the Gesture under way has ends that Gesture as Interrupted, rather than joining it.
