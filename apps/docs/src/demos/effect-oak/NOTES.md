# Effect Oak demos

Foldkit's examples, ported to Effect Oak to see what fits. Each demo has its
own `notes.md`. This page has one row per demo and the blockers they found.

## Wiring a demo

- Code lives in `<slug>/`, a deep module. `index.ts` exports the Node and its View (and the Layer, if the app needs Services).
- The route `src/routes/demos/effect-oak/<slug>.tsx` makes the app with `toReact(Node, View, layer)` and shows it in `Shell` with `<DemoMenu />`. `head: ({ match }) => demoHead(match.fullPath)` takes the title and description from the demo's entry.
- Each demo has an entry in `DEMOS` in `src/lib/demos.tsx` with its `group`. The home page and the menu group demos by it.

## Demos

| Demo                                                      | Group                  | Status  | Note                                                                                           |
| --------------------------------------------------------- | ---------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| [counter](counter/notes.md)                               | Basics                 | works   | One Node, three Messages.                                                                      |
| [counters](counters/notes.md)                             | Basics                 | partial | Rows are Foldkit-style Submodels in the parent's Model; they cannot be child Nodes.            |
| [stopwatch](stopwatch/notes.md)                           | Basics                 | works   | Two States and no ticks: the View draws the running time at each Frame.                        |
| [crash-view](crash-view/notes.md)                         | Basics                 | partial | No crash hook: the View catches the throw itself, and the crash is outside the Log.            |
| [todo](todo/notes.md)                                     | Basics                 | partial | Loading Lifetime, Composer child Node with a Request, saving Commands; rows are not Nodes.     |
| [weather](weather/notes.md)                               | Commands and Lifetimes | works   | States for Idle, Loading, Loaded, Failed; real Open-Meteo API through a Forecast Service.      |
| [interrupting-commands](interrupting-commands/notes.md)   | Commands and Lifetimes | partial | Cancel all is `replaceCommands`; cancelling one needs a demo Service that keys work by id.     |
| [slow-warnings](slow-warnings/notes.md)                   | Commands and Lifetimes | partial | No slow hook: the View times Update, View and patch work itself. Subscription phase skipped.   |
| [managed-resource-layer](managed-resource-layer/notes.md) | Commands and Lifetimes | works   | A Lifetime holds the engine's Layer for as long as On lasts; a host Service keeps the engine.  |
| [form](form/notes.md)                                     | Commands and Lifetimes | works   | Three field Nodes from one factory report up by Request; latest email check wins by replacing. |
| [websocket-chat](websocket-chat/notes.md)                 | Commands and Lifetimes | works   | Real echo socket held open by Online's Lifetime; Composer child sends through a Service.       |
| [road](game/notes.md) (code `game/`)                      | Graphics               | works   | Effect Oak's own demo, moved to `/demos/effect-oak/road`.                                      |

## Library blockers

1. **No list of Children.** Children are a fixed record per State, so a Node
   cannot have one Child per row of its Model (`Node.each(Child, model => keys)`
   would be the API). Hit by [counters](counters/notes.md),
   [todo](todo/notes.md) and
   [interrupting-commands](interrupting-commands/notes.md).
2. **No crash handling.** An Update that throws throws out of `send`. It is not
   logged, the Runtime carries on, and there is no crash view or report hook.
   Hit by [crash-view](crash-view/notes.md).
3. **Children cannot be given input when they are created.** `init` takes
   nothing, so a Child made on entering a State cannot start from that State's
   data. Hit by [todo](todo/notes.md) (no Editor Child).
4. **Testing: Commands are anonymous Effects.** A test cannot check which
   Command an Update asked for, or answer it with a chosen Message, the way
   Foldkit's `Command.expectHas` and `Command.resolve` do. Named Commands
   would fix it. Hit by [todo](todo/notes.md), [road](game/notes.md),
   [weather](weather/notes.md), [interrupting-commands](interrupting-commands/notes.md),
   [form](form/notes.md) and [websocket-chat](websocket-chat/notes.md).
5. **Testing: no typed way to run one Update, or draw a View from a given
   Model, State and Time.** Foldkit's `story` and `scene` need both. Hit by
   every demo ([counter](counter/notes.md) lists what is needed).
6. **Testing: no way to emit a Lifetime's Message in a unit test**, like
   Foldkit's `Subscription.emit` or `ManagedResource.acquire`. Hit by
   [todo](todo/notes.md), [managed-resource-layer](managed-resource-layer/notes.md)
   and [websocket-chat](websocket-chat/notes.md).
7. **No way to stop one Command.** `replaceCommands` stops all of a Node's
   Commands; nothing stops one by key. Keyed Commands
   (`Command.keyed('upload-3', effect)` and `interrupt: ['upload-3']` in
   Update's return, with the outcome as a Message) would fix it. Hit by
   [interrupting-commands](interrupting-commands/notes.md).
8. **No slow-work hook.** Nothing reports how long an Update or a View took,
   like Foldkit's `slow` callback. `onSlow` on `Runtime.start` and `toReact`,
   or a `tookMs` on each Log entry, would be the API. Hit by
   [slow-warnings](slow-warnings/notes.md).
9. **A State cannot Provide a resource that an Effect builds.** `provides` is
   a plain function of Model and State, so a Layer-built engine or an open
   socket has to be kept by a Service in the app's Layer and read from there.
   A scoped `provides` (`resources: { On: () => engineLayer }`, built on
   entry, torn down on leaving) would be the API. Hit by
   [managed-resource-layer](managed-resource-layer/notes.md) and
   [websocket-chat](websocket-chat/notes.md).
10. **Lifetimes and Children belong to exactly one State.** A resource held
    across Booting and Ready, or Connecting and Connected, forces the two
    into one State with a flag; a Child wanted in several States is created
    anew on every Transition between them. Lifetimes and Children keyed by a
    set of States (`'Booting | Ready'`, or `'*'`), kept while moving inside
    the set, would be the API. Hit by
    [managed-resource-layer](managed-resource-layer/notes.md),
    [websocket-chat](websocket-chat/notes.md), [weather](weather/notes.md)
    and [form](form/notes.md).
11. **Each State is drawn by its own keyed component**, so DOM that should
    survive a Transition is remounted: an input loses focus. Letting a Node
    with States be drawn by one function would be the API. Hit by
    [form](form/notes.md) (field status moved out of States) and
    [weather](weather/notes.md).

Nothing went badly wrong in the Basics or the Commands and Lifetimes batch.
The build, the Shell and Time Travel all behaved in every demo.
