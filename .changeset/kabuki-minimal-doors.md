---
'@kestack/kabuki': patch
---

Every `index.ts` exports only what something outside its folder imports. Gone from the package's doors: the types nothing named (`Child`, `Worker`, `Workers`, `Data`, `AnyDefined`, `Handled`, `Restore`, `HistoryOptions`, `ReplayOptions`, `WorkerDefinition`, the Query helper types, `AppOptions`), `RESTORE`, and from `routing` the types `AnyRoute`, `MoveOptions`, `ReloadOptions`, `Wanted`, `HashScroll`, `ScrollLocation`, `ScrollRestorationOptions`, `LinkProps`, `RouterDefinition`, `RouterState`, `DataInfo`, `From`, `PageProps`, `PlaceInfo`, `RenderMode` and `RouteOf`. Every function, component and hook stays. A type that only annotates a parameter or an inferred return is inferred at the call site instead.
