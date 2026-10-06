---
'@kstackz/expo-toolkit': patch
---

`Meter` grows its fill from empty when it first shows and eases to each new value (500 ms, the web's `transition-[width]` curve); with reduced motion it is drawn at once.
