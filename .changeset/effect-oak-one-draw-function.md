---
'effect-oak': patch
---

`View.make(Actor, (self, props) => …)` takes one draw function for every State: `self._tag` narrows `state` and `children`, so a Transition no longer remounts the DOM. A View is placed with `instance={…}` instead of `node={…}`, takes data props from its parent as its draw's second parameter (a function prop is a type error), and hands `root` (`ref` and `style`) to the element it spreads it on, so `motion.create(SomeView)` animates it without re-running the View on every parent render. A View whose Instance has stopped keeps drawing its last data, so an exit animation has something to show. Keyed Handles carry their `key`. See ADR 0015.
