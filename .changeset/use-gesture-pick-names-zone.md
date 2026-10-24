---
'@kestack/use-gesture': patch
---

A Touch Source's `sink.pick(direction)` names the zone that would take the Gesture as well as how, `{ zone, how }`, so the source can tell what lies between the finger and it. `PointerSink` takes the Zone type as a second parameter.
