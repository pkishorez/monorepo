---
'effect-oak': patch
---

First version of Effect Oak: an app as one tree of Nodes outside React. `Node.make` defines a Node's Model, Messages, Update, Lifetimes, Children and the Services it Requires and Provides per State; `Runtime.start` runs the tree; `View.make` and `toReact` draw it with React.
