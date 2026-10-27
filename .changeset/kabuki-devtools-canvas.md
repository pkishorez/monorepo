---
'@kestack/web-platform': patch
---

`KabukiDevtools` is a new Inspector: every Instance a card on a canvas to pan and zoom, over a Timeline of every Step, with what each Step added, changed or took away marked, and a Capability picked shown from the card that provides it to every card that uses it. A "Travel the app" switch, on at first or as `defaultTravel` says, decides whether picking a Step Time Travels the app, and Fork carries on from a past Step on a new Branch. Given a `story`, it tells it beside Live. It lays itself out by its own width, so it reads the same full screen, docked in a side panel or on a phone. `presenting`, `dotted`, `timelineAt` and `className` work as before.

The old Inspector and its `layout` prop are gone, and `Inspector` is no longer exported. The theme gains the `running`, `added`, `changed` and `removed` colours it marks with.
