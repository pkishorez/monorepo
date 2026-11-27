---
'@kestack/kabuki': patch
---

An Actor's parts written outside its `build` are typed from its Shape alone, `typeof FolderViewerShape`, so every parameter is typed where it is written.

**Added**

- `InitOf`, `UpdatesOf`, `WorkersOf`, `SelfOf` and `DataOf`, from `@kestack/kabuki/types`: its `init`, its Updates and Workers at the top of `build`, what its Workers and Provides hold of an Instance, and its data, in one State when named.
- `ViewPropsOf`, from `@kestack/kabuki/react/types`: `ViewProps` from the Shape, narrowed by State, without its Children and Address.
