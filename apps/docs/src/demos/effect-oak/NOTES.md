# Effect Oak demos

Foldkit's examples, ported to Effect Oak to see what fits. Each demo has its
own `notes.md`. This page has one row per demo and the blockers they found.

## Wiring a demo

- Code lives in `<slug>/`, a deep module. `index.ts` exports the Node and its View (and the Layer, if the app needs Services).
- The route `src/routes/demos/effect-oak/<slug>.tsx` makes the app with `toReact(Node, View, layer)` and shows it in `Shell` with `<DemoMenu />`. `head: ({ match }) => demoHead(match.fullPath)` takes the title and description from the demo's entry.
- `frame-canvas/` is a 2D canvas painted at every Frame, shared by canvas-art and generative-art (one Rule per demo that uses it, in `laymos.config.json`).
- `async-data/` is fetched data as Model data (Foldkit's AsyncData) with its loading and error panels, shared by api-cache, api-cache-query and charting. `blog-server/` is the fake blog API both API cache demos ask through a Service.
- `location/` is the demo's own path after the `#`, as a Location Service (push, replace, back and forward), with `heardUrl` for Lifetimes, `pushUrl` for Commands and a `Link`. Shared by routing, route-transitions, view-transitions and personal-blog; the docs router owns the real path.
- embedding makes its own app with `toReact`, because its host page mounts the widget into an element; its route hands the Shell the host page with the widget's Log and Time Travel.
- Each demo has an entry in `DEMOS` in `src/lib/demos.tsx` with its `group`. The home page and the menu group demos by it.

## Demos

| Demo                                                      | Group                  | Status  | Note                                                                                            |
| --------------------------------------------------------- | ---------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| [counter](counter/notes.md)                               | Basics                 | works   | One Node, three Messages.                                                                       |
| [counters](counters/notes.md)                             | Basics                 | partial | Rows are Foldkit-style Submodels in the parent's Model; they cannot be child Nodes.             |
| [stopwatch](stopwatch/notes.md)                           | Basics                 | works   | Two States and no ticks: the View draws the running time at each Frame.                         |
| [crash-view](crash-view/notes.md)                         | Basics                 | partial | No crash hook: the View catches the throw itself, and the crash is outside the Log.             |
| [todo](todo/notes.md)                                     | Basics                 | partial | Loading Lifetime, Composer child Node with a Request, saving Commands; rows are not Nodes.      |
| [weather](weather/notes.md)                               | Commands and Lifetimes | works   | States for Idle, Loading, Loaded, Failed; real Open-Meteo API through a Forecast Service.       |
| [interrupting-commands](interrupting-commands/notes.md)   | Commands and Lifetimes | partial | Cancel all is `replaceCommands`; cancelling one needs a demo Service that keys work by id.      |
| [slow-warnings](slow-warnings/notes.md)                   | Commands and Lifetimes | partial | No slow hook: the View times Update, View and patch work itself. Subscription phase skipped.    |
| [managed-resource-layer](managed-resource-layer/notes.md) | Commands and Lifetimes | works   | A Lifetime holds the engine's Layer for as long as On lasts; a host Service keeps the engine.   |
| [form](form/notes.md)                                     | Commands and Lifetimes | works   | Three field Nodes from one factory report up by Request; latest email check wins by replacing.  |
| [websocket-chat](websocket-chat/notes.md)                 | Commands and Lifetimes | works   | Real echo socket held open by Online's Lifetime; Composer child sends through a Service.        |
| [road](game/notes.md) (code `game/`)                      | Graphics               | works   | Effect Oak's own demo, moved to `/demos/effect-oak/road`.                                       |
| [canvas-art](canvas-art/notes.md)                         | Graphics               | works   | No ticks: each ball's place is a formula of the box's clock, drawn at each Frame.               |
| [snake](snake/notes.md)                                   | Graphics               | works   | Ticks, as a chain of Commands: a Lifetime cannot speed up with the score.                       |
| [generative-art](generative-art/notes.md)                 | Graphics               | partial | Particles stepped in the View between Messages; the sliders cannot be Child Nodes.              |
| [pixel-art](pixel-art/notes.md)                           | Graphics               | partial | Tools and Export are Children; the resize picker cannot be one: no data from parent to Child.   |
| [api-cache](api-cache/notes.md)                           | Data                   | works   | Each tab a Child with its cache as AsyncData; Stats ask the Tabs Service before refetching.     |
| [api-cache-query](api-cache-query/notes.md)               | Data                   | partial | Queries are Nodes; the app can only tell them what to load through a mailbox Service.           |
| [query-sync](query-sync/notes.md)                         | Data                   | works   | No router: the URL is a Service each Node listens to; Time Travel does not move the URL.        |
| [charting](charting/notes.md)                             | Data                   | works   | Live npm and GitHub data drawn as SVG from the Model, so no chart sync Commands.                |
| [map](map/notes.md)                                       | Data                   | works   | OSM tiles; the camera and flights are Model data drawn at every Frame.                          |
| [shopping-cart](shopping-cart/notes.md)                   | Apps                   | partial | Pages are States; leaving one destroys its Child, and products cannot show cart quantities.     |
| [kanban](kanban/notes.md)                                 | Apps                   | works   | Drag is a State whose Lifetime follows the pointer; add-card forms are one Node per column.     |
| [auth](auth/notes.md)                                     | Apps                   | works   | Signed-out and signed-in sites are Children of their States; pages are States, no URLs.         |
| [state-machine](state-machine/notes.md)                   | Apps                   | partial | The checkout is one Node's States; Transitions are not data, so no chart or analysis.           |
| [routing](routing/notes.md)                               | Routing and host       | works   | Pages are root States heard from a Location Service; Time Travel does not move the URL.         |
| [route-transitions](route-transitions/notes.md)           | Routing and host       | works   | Entry is a Child's Lifetime, staying and leaving are Update; the Studio reports every edit up.  |
| [view-transitions](view-transitions/notes.md)             | Routing and host       | partial | The View wraps its Send in startViewTransition + flushSync; back and forward cannot animate.    |
| [personal-blog](personal-blog/notes.md)                   | Routing and host       | works   | Tiny markdown formatter; pages are Model data so the Counter Child survives navigation.         |
| [embedding](embedding/notes.md)                           | Routing and host       | works   | Hand-built `embed` into a plain DOM page, ports as a Service; one mount at a time.              |
| [web-components](web-components/notes.md)                 | Routing and host       | works   | Two hand-made custom elements; React 19 binds properties and events, nothing was missing.       |
| [ssr](ssr/notes.md)                                       | Routing and host       | skipped | Not built: Effect Oak runs only in the browser. Listed here only, not in `DEMOS`.               |
| [ssg](ssg/notes.md)                                       | Routing and host       | skipped | Not built, for the same reasons as ssr. Listed here only, not in `DEMOS`.                       |
| [job-application](job-application/notes.md)               | Large apps             | works   | Five step Children kept for the whole app; each reports its answers up so the root can preview. |

## Library blockers

1. **No list of Children.** Children are a fixed record per State, so a Node
   cannot have one Child per row of its Model (`Node.each(Child, model => keys)`
   would be the API). Hit by [counters](counters/notes.md),
   [todo](todo/notes.md),
   [interrupting-commands](interrupting-commands/notes.md) and
   [job-application](job-application/notes.md) (positions and skills are
   data in their step).
2. **No crash handling.** An Update that throws throws out of `send`. It is not
   logged, the Runtime carries on, and there is no crash view or report hook.
   Hit by [crash-view](crash-view/notes.md).
3. **Children cannot be given input when they are created.** `init` takes
   nothing, so a Child made on entering a State cannot start from that State's
   data. Hit by [todo](todo/notes.md) (no Editor Child),
   [kanban](kanban/notes.md) (the column id baked in by a factory) and
   [auth](auth/notes.md) (the signed-in pages start in `Opening` to read the
   session from a Service) and
   [route-transitions](route-transitions/notes.md) (the Studio editor starts
   empty). The root's `init` takes nothing either, so an app cannot be given
   flags: [embedding](embedding/notes.md) starts `Waiting` and reads them
   from a Service, [ssr](ssr/notes.md) and [ssg](ssg/notes.md) need
   `init(flags)` to hydrate, and [job-application](job-application/notes.md)
   reads Foldkit's `today` flag in the View.
4. **Testing: Commands are anonymous Effects.** A test cannot check which
   Command an Update asked for, or answer it with a chosen Message, the way
   Foldkit's `Command.expectHas` and `Command.resolve` do. Named Commands
   would fix it. Hit by [todo](todo/notes.md), [road](game/notes.md),
   [weather](weather/notes.md), [interrupting-commands](interrupting-commands/notes.md),
   [form](form/notes.md), [websocket-chat](websocket-chat/notes.md),
   [canvas-art](canvas-art/notes.md), [snake](snake/notes.md),
   [generative-art](generative-art/notes.md), [pixel-art](pixel-art/notes.md)
   and every Data, Apps, Routing and host and Large apps demo.
5. **Testing: no typed way to run one Update, or draw a View from a given
   Model, State and Time.** Foldkit's `story` and `scene` need both. Hit by
   every demo ([counter](counter/notes.md) lists what is needed).
6. **Testing: no way to emit a Lifetime's Message in a unit test**, like
   Foldkit's `Subscription.emit` or `ManagedResource.acquire`. Hit by
   [todo](todo/notes.md), [managed-resource-layer](managed-resource-layer/notes.md),
   [websocket-chat](websocket-chat/notes.md),
   [generative-art](generative-art/notes.md), [kanban](kanban/notes.md),
   [auth](auth/notes.md), [shopping-cart](shopping-cart/notes.md) and
   [job-application](job-application/notes.md) (Submit's reveal).
7. **No way to stop one Command.** `replaceCommands` stops all of a Node's
   Commands; nothing stops one by key. Keyed Commands
   (`Command.keyed('upload-3', effect)` and `interrupt: ['upload-3']` in
   Update's return, with the outcome as a Message) would fix it. Hit by
   [interrupting-commands](interrupting-commands/notes.md) and
   [job-application](job-application/notes.md) (replacing the email check
   also stops a pending report).
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
    [websocket-chat](websocket-chat/notes.md), [weather](weather/notes.md),
    [form](form/notes.md), [generative-art](generative-art/notes.md)
    (sliders wanted in both Running and Paused), [kanban](kanban/notes.md)
    (add-card forms lost when a drag starts) and
    [shopping-cart](shopping-cart/notes.md) (a page's Child, its search and
    its fetched catalog are lost on every page change),
    [routing](routing/notes.md) (all eight route States start the same URL
    Lifetime; People's recent searches are lost on leaving it) and
    [personal-blog](personal-blog/notes.md) (pages had to be Model data, not
    States, so the Counter Child survives navigation) and
    [job-application](job-application/notes.md) (the current step is Model
    data, so no step's answers are lost on moving).
11. **Each State is drawn by its own keyed component**, so DOM that should
    survive a Transition is remounted: an input loses focus. Letting a Node
    with States be drawn by one function would be the API. Hit by
    [form](form/notes.md) (field status moved out of States),
    [weather](weather/notes.md) and [auth](auth/notes.md) (login inputs
    drawn again on Submitting).

12. **A Lifetime cannot follow the Model.** It starts once, with the Model
    as it was on entering the State; Foldkit's Subscriptions restart when
    `modelToDependencies` changes. A Lifetime keyed on a projection
    (`{ key: ({ model }) => …, run: … }`, restarted when the key changes)
    would be the API. Hit by [snake](snake/notes.md) (its clock speeds up
    with the score, so each tick is a Command planning the next),
    [api-cache](api-cache/notes.md) and
    [api-cache-query](api-cache-query/notes.md) (the stats timer ticks while
    its tab is hidden). A Lifetime also keeps the Services it started with,
    while a Command sees the latest ones.
13. **A parent cannot pass data to a Child.** A Child's Update and View see
    only its own Model; Services reach only its Commands and Lifetimes.
    Foldkit gives a Submodel's view `viewInputs`. A View input
    (`<ResizeView node={children.resize} input={{ size }} />`, typed by the
    Child's View, replay-safe because it comes from the parent's State) would
    be the API. Hit by [pixel-art](pixel-art/notes.md) (no Resize Child),
    [api-cache-query](api-cache-query/notes.md) (no Cached badge),
    [query-sync](query-sync/notes.md) (each control listens to the URL
    itself) and [map](map/notes.md) (the list cannot show the map's
    selection), [shopping-cart](shopping-cart/notes.md) (products cannot
    show their cart quantity), [auth](auth/notes.md),
    [state-machine](state-machine/notes.md) (the edition picker stays in the
    parent), [routing](routing/notes.md) (People listens to the URL itself)
    and [web-components](web-components/notes.md) (the color fields stay in
    the root). The other direction is missing too: a parent cannot read a
    Child's Model, so work on leaving a State that needs a Child's data has
    the Child report every change up first
    ([route-transitions](route-transitions/notes.md): the Studio's draft is
    two Messages per keystroke). The Child's last Model handed to the
    parent's Update on a Transition would be one API.
    [job-application](job-application/notes.md) shows the cost at size: the
    nav, preview, review and submit need every step's answers, so each step
    reports its whole Part on every change, a second Schema per step
    (`parts.ts`) and a `Reported` Message after every edit.

14. **A parent cannot send its Child a Message.** Update can only change its
    own Node, so a parent that decides (a tab is shown, load this post) has
    no way to tell the Child that acts. Foldkit folds a Submodel's update into
    the parent's. `tell: [[children.stats, { _tag: 'Revalidate' }]]` in
    Update's return, or a `Node.tell(child, message)` Command, would be the
    API; the told Message is logged like any other, so Replay is unchanged.
    Hit by [api-cache](api-cache/notes.md) (Stats asks a Service instead),
    [api-cache-query](api-cache-query/notes.md) (a mailbox Service in the
    Layer), [charting](charting/notes.md), [map](map/notes.md) and
    [job-application](job-application/notes.md) (Submit reveals every step's
    errors through a Reveals Service each step's Lifetime hears).
15. **No routing.** Pages work as a root's States, heard from a Location
    Service in the Layer ([routing](routing/notes.md) has the full list).
    What a router needs from Effect Oak:
    - `init` cannot take the URL, so the first page is a Message after Time
      0 and Replay at Time 0 draws nothing. Reading `window.location` in init
      is not honest: Replay runs init again with the address as it is by
      then. `Runtime.start(node, { url })` with `init({ url })`, the URL kept
      with the Log, would fix it.
    - URL changes and link clicks are not Runtime Messages, and navigation is
      not a library Command. Every app writes a Location Service, a Lifetime
      per State (blocker 10) told the path it entered with, and a link
      component. A `routing: { onUrlChange, onUrlRequest }` option on
      `toReact` and `pushUrl`/`replaceUrl`/`back` Commands would be the API.
    - Time Travel does not move the address bar, and back and forward change
      the live app behind a Replay. The URL should be a projection of the
      shown tree (`toReact(…, { url: (root) => path })`), written with
      `replaceState` while in Replay and put back on Live, with history
      events held while paused. The routing demos draw their own address bar
      from the Model, which does replay.
    - URL-first navigation (click → push → hear → change State) reaches the
      DOM a Lifetime later, too late for a View Transition
      ([view-transitions](view-transitions/notes.md) changes the State first).
    - Inside a routed React app the host router owns history: the Location
      writes TanStack's entry index into each push to keep back and forward
      working. An adapter to the host's router would be the clean way.

    Hit by [query-sync](query-sync/notes.md),
    [shopping-cart](shopping-cart/notes.md), [auth](auth/notes.md),
    [routing](routing/notes.md),
    [route-transitions](route-transitions/notes.md),
    [view-transitions](view-transitions/notes.md),
    [personal-blog](personal-blog/notes.md) and [ssg](ssg/notes.md).

16. **`useFrame` cannot drive a render.** Its callback also runs after every
    render, so setting state in it loops forever when the value depends on
    the Time. DOM that changes shape at each Frame (map tiles) has to put the
    state change off to the next animation frame. A
    `useFrameValue((at) => value, equals)` hook would be the API. Hit by
    [map](map/notes.md).

17. **Transitions are not data.** A Transition is whatever Update returns
    (ADR 0002), so nothing can list a Node's possible Transitions without
    running it. Foldkit's `Machine` finds dead transitions and unreachable
    States and prints a Mermaid chart. An optional declaration in `make`
    (`transitions: { Cart: ['Shipping', 'Payment', 'Cancelled'] }`), with each
    State's rules typed to return only those tags, would be the API. Hit by
    [state-machine](state-machine/notes.md).

18. **No View Transition hook.** A View can wrap its own Send in
    `document.startViewTransition` with `flushSync` (the Runtime handles a
    Message synchronously), but Messages from Lifetimes and Commands (back
    and forward, a fetch finishing) cannot animate, and the View must guess
    the next State before sending. A
    `viewTransition: ({ before, after, message }) => false | { types }`
    option on `toReact`, wrapping the commit of each handled Message and
    skipped during Time Travel, would be the API. Hit by
    [view-transitions](view-transitions/notes.md).
19. **No way to run an app outside React, or to talk to it from outside.**
    `toReact` is made once with a fixed Layer, keeps one Runtime in its
    closure (so it can be mounted once at a time), and `useRoot().send` is a
    React hook. Flags and ports become a module-level wire and a Service. A
    per-mount `mount(element, { layer, flags })` returning
    `{ send, subscribe, dispose, useLog, useTimeTravel }`, and typed ports on
    the root, would be the API. Hit by [embedding](embedding/notes.md).
20. **Runs only in the browser: no SSR, SSG or hydration.** `toReact` starts
    the Runtime after mounting and draws nothing before. It would need
    `init(flags)` (blocker 3), drawing the root View from the init tree with
    no Runtime (Replay can already build it), the tree encoded with its
    Schemas into the HTML, and `Runtime.start(node, { from })` resuming from
    it so `hydrateRoot` finds the same DOM. Hit by [ssr](ssr/notes.md) and
    [ssg](ssg/notes.md), both skipped.

## Other findings

- **Interrupting a Stream of a SubscriptionRef's changes is logged as a
  failure.** In effect 4.0.0 such a Stream ends in a `Done` failure when its
  fiber is interrupted, and the Runtime's `fork` reports every non-interrupt
  failure, so a Lifetime reading one logs `[effect-oak] … failed: Done` on
  every Transition and when the app stops. query-sync's Url Service logs it
  on unmount (and twice on load under StrictMode). The shared `location/`
  is built on `Stream.callback` instead, which interrupts cleanly. The
  Runtime could treat `Done` from an interrupted Lifetime as an interrupt.

Nothing went badly wrong in the Basics, the Commands and Lifetimes, the Graphics, the Data, the Apps, the Routing and host or the Large apps batch.
The build, the Shell and Time Travel all behaved in every demo.
