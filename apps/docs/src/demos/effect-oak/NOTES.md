# Effect Oak demos

Foldkit's examples, ported to Effect Oak to see what fits. Each demo has its
own `notes.md`. This page has one row per demo and the blockers they found.

## Wiring a demo

- Code lives in `<slug>/`, a deep module. `index.ts` exports the Node and its View (and the Layer, if the app needs Services).
- The route `src/routes/demos/effect-oak/<slug>.tsx` makes the app with `toReact(Node, View, layer)` and shows it in `Shell` with `<DemoMenu />`. `head: ({ match }) => demoHead(match.fullPath)` takes the title and description from the demo's entry.
- Each demo has an entry in `DEMOS` in `src/lib/demos.tsx` with its `group`. The home page and the menu group demos by it.

## Demos

| Demo                                 | Group    | Status  | Note                                                                                       |
| ------------------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------ |
| [counter](counter/notes.md)          | Basics   | works   | One Node, three Messages.                                                                  |
| [counters](counters/notes.md)        | Basics   | partial | Rows are Foldkit-style Submodels in the parent's Model; they cannot be child Nodes.        |
| [stopwatch](stopwatch/notes.md)      | Basics   | works   | Two States and no ticks: the View draws the running time at each Frame.                    |
| [crash-view](crash-view/notes.md)    | Basics   | partial | No crash hook: the View catches the throw itself, and the crash is outside the Log.        |
| [todo](todo/notes.md)                | Basics   | partial | Loading Lifetime, Composer child Node with a Request, saving Commands; rows are not Nodes. |
| [road](game/notes.md) (code `game/`) | Graphics | works   | Effect Oak's own demo, moved to `/demos/effect-oak/road`.                                  |

## Library blockers

1. **No list of Children.** Children are a fixed record per State, so a Node
   cannot have one Child per row of its Model (`Node.each(Child, model => keys)`
   would be the API). Hit by [counters](counters/notes.md) and
   [todo](todo/notes.md).
2. **No crash handling.** An Update that throws throws out of `send`. It is not
   logged, the Runtime carries on, and there is no crash view or report hook.
   Hit by [crash-view](crash-view/notes.md).
3. **Children cannot be given input when they are created.** `init` takes
   nothing, so a Child made on entering a State cannot start from that State's
   data. Hit by [todo](todo/notes.md) (no Editor Child).
4. **Testing: Commands are anonymous Effects.** A test cannot check which
   Command an Update asked for, or answer it with a chosen Message, the way
   Foldkit's `Command.expectHas` and `Command.resolve` do. Named Commands
   would fix it. Hit by [todo](todo/notes.md) and [road](game/notes.md).
5. **Testing: no typed way to run one Update, or draw a View from a given
   Model, State and Time.** Foldkit's `story` and `scene` need both. Hit by
   every demo ([counter](counter/notes.md) lists what is needed).
6. **Testing: no way to emit a Lifetime's Message in a unit test**, like
   Foldkit's `Subscription.emit`. Hit by [todo](todo/notes.md).

Nothing went badly wrong in this batch. The build, the Shell and Time Travel
all behaved in every demo.
