---
'@kstackz/web-platform': patch
---

`recipes/effect-oak-devtools` adds `EffectOakDevtools`, a panel around an Effect Oak app: a Timeline of every Branch as a graph, one dot per Message, that Time Travels to any Step and forks from it, and an Inspector that draws the whole app as a map of its Actors, States and Children, dim until running, lighting up each Step with what it started and stopped, keyed Children folded to a count. Below both, the Step shown: What happened (the Message in plain words, its payload, and each field's old and new value), Snapshot (every Instance's data as an open tree, what changed lit) and JSON, narrowed to the Instance picked. `JsonTree` takes `tone="syntax"` to color values by kind. The Timeline shows the newest 50 Messages (`limit`, or more from its footer) and keeps up with a flood of them. It docks right and resizes, or peeks from the bottom on a phone. `effect-oak` is an optional peer, needed only by this recipe.
