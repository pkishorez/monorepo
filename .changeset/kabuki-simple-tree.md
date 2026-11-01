---
'@kestack/kabuki': patch
---

Kabuki's import paths are reorganized. **Breaking.**

Where things live now:

| Path                          | Gives                                            |
| ----------------------------- | ------------------------------------------------ |
| `@kestack/kabuki`             | `Actor`, `Command`, `History`, `Runtime`         |
| `@kestack/kabuki/react`       | `View`, `useChild`, `useChildren`                |
| `@kestack/kabuki/routing`     | `Page`, `Router`, `Navigation`, `useRouter`      |
| `@kestack/kabuki/start`       | `Start`                                          |
| `@kestack/kabuki/<layer>/<x>` | one value and all its types, e.g. `core/runtime` |

**Breaking**

- `toReact(actor, view, layer, options)` → `View.app(view, { layer, ...options })`. `layer` is optional when nothing is required.
- Moved: `Stopped` → `core/runtime`, `useLive` → `react/view`, `useElementScrollRestoration` → `routing/router`, `Router.memory` / `Router.cached` → `Loading.memory` / `Loading.cached` in `routing/capabilities`, `handle` / `instanceAt` / `isMany` → `Snapshot.*` in `core/snapshot`.
- Renamed types: `Page.NotFound` → `NotFoundError`, `Page.Redirect` → `RedirectTo`, `Start.DocumentProps` → `DocumentProps` from `start/app`.
- Shorter adapter paths: `routing/browser`, `routing/tanstack`, `start/cloudflare`, `start/nitro`.
- Removed: `Replay`, `outcomeOf`, `init`, `restore`, `isRestore`, `isHistory`, `lazyOf`, `RUN`. Use `history.seek`, `history.snapshotAt` and `history.outcome`.
