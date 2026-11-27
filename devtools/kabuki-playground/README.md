# @kestack/kabuki-playground

A small to-do app on Kabuki Start, to test the page, the in-page Inspector and the DevTools Server against each other

## Big picture

DevTools draws whatever a Kabuki app is, so it needs an app to be checked
against. This one is a to-do list small enough to hold in your head. It is
a Kabuki Start app on [`@kestack/kabuki`](../../packages/kabuki/README.md),
drawn with [`@kestack/web-platform`](../../platforms/web-platform/README.md),
and it shows up three ways at once: as the page, in the Inspector docked in
the page (`@kestack/devtools-kabuki/app`), and as the Kabuki Session
`kabuki-playground` in the DevTools Server at `:14400`.

The tree is the Router, one page, the Todos list, and one Todo per to-do.
Todos is Loading, Ready or Failed; a Todo is Idle, Editing, Saving or
Failed. Each part of Kabuki is in it once, behind something you can click:

| Part             | What you do    | What happens                                                           |
| ---------------- | -------------- | ---------------------------------------------------------------------- |
| A Child per key  | Add a to-do    | Todos places one more Todo                                             |
| Props, down      | Tick a box     | Todos keeps which are done and hands `done` back down                  |
| Emit, up         | Tick or delete | The Todo Emits `Toggled` or `Deleted` to Todos                         |
| Worker           | Open the page  | Todos' `load` Worker asks the server while Loading                     |
| A Worker per key | Tick a box     | Todos' `sync` Worker saves that to-do, retrying while the server fails |
| Command          | Rename a to-do | The Todo is Saving while its `save` Command runs                       |
| Capability       | Rename a to-do | `save` goes through `Store`, which Todos Provides only when Ready      |

The starting to-dos are the data that breaks UIs: a long sentence, a long
unbroken link, and Japanese, Arabic and emoji. **Add 50** then **Mark all
done** gives Todos 55 Children and 54 `sync` Workers, one per to-do whose
tick it saves to the server, to see how DevTools folds them.

## Usage

### Run it beside DevTools

Start the DevTools Server first, then the playground. Its page dials the
server through `/__devtools` on its own origin, which the Web Platform's
Vite plugin pipes to `http://127.0.0.1:14400`.

```bash
node devtools/devtools/dist/cli/main.mjs                 # the DevTools Server, on :14400
pnpm --filter @kestack/kabuki-playground dev             # builds its workspace packages, then vp dev through Portless
pnpm --filter @kestack/kabuki-playground lint            # vp check, tsc and monoverse lint
```

- The page is at the Portless URL `pnpm dev` prints, or at the
  `http://127.0.0.1:<port>/` Vite prints.
- The Inspector in the page opens from the button in the bottom-right
  corner, or with Ctrl+/ or ⌘/.
- The same app is the session `kabuki-playground` at
  `http://127.0.0.1:14400/kabuki?session=kabuki-playground`, and to
  agents through the `kabuki_*` MCP tools.
- The `server` Fake's controls slow it down (`SetLatency`) or make every
  load and save fail (`StartFailing`, `StopFailing`), to see Failed and
  its retry.
