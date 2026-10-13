---
'@kstackz/ai-toolkit': patch
'@kstackz/effect-tracer': patch
'@kstackz/lotel': patch
---

Moves to stable Effect 4: the `effect` peer is now `^4.0.0`. ai-toolkit's `makePlaygroundSync` takes `store` instead of `platform`. lotel's Span and Log Records drop `flowId` and `participantName`; records stored with them still read.
