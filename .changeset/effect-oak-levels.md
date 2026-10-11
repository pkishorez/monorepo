---
'effect-oak': patch
'@kstackz/web-platform': patch
---

`Actor.make` takes only `requires`, now a list (`requires: [Server]`), and the Schemas: `input`, `model`, `message`, `state`. `build` takes the behavior at two Levels: the top, for as long as the Instance lives, and `state: { [Tag]: { … } }`, one block per State. Each Level holds `provides` (one Layer), `children`, `invoke`, `on` (the Updates, formerly `update`) and `workers`. A Child written at the top lasts through every Transition and sees the top-level Provides; a Worker written in a State's block is owned by that State, so the `in` Condition is gone. `make` no longer takes `provides` or `children`: the Layer a `provides` builder returns names what it Provides.

Requires now caps only the Actor's own Workers, Commands and Provides. A Child's needs no longer have to pass through its parent's Requires: what no ancestor Provides bubbles up, and `Runtime.start` and `toReact` require the app's Layer to cover it. See ADR 0017.

The `effect-oak-devtools` Inspector puts each Worker under the State whose block it is written in.
