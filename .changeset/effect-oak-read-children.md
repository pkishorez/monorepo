---
'effect-oak': patch
---

`useChild` and `useChildren` let a parent View read its Children's Model, State and Props, to draw them. They never Send, reach only one level down, and re-render only the component that calls them. An optional selector, as the second argument, re-renders it only when what it picks changes.
