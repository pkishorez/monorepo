# Embedding

Status: works, with a hand-built `embed`. A plain DOM host page mounts the
widget into its own element, gives it a starting count, pushes a step in,
hears every count back, and can unmount and mount it again. Only one widget
can be mounted at a time.

## What was ported

Foldkit's `embedding`: a host page with no Foldkit runtime embeds a widget
that ticks up by a step every second. Flags at mount (`initialCount: 10`),
an inbound port for the step, an outbound port for the count, `dispose` on
unmount.

```
host-page/   the host: plain DOM (innerHTML and listeners), knows only `embed`
embedding.tsx
             toReact(Widget, WidgetView, HostLive), `embed` (flags, a React
             root in the host's element, the handle), and the host page as
             the app the Shell runs
port/        the wire: the host's side (setFlags, sendStep, onCount) and the
             widget's Host Service in the Layer
widget/
  Widget     requires Host; Model { count, step }
    Waiting  Lifetime: Host.flags → GotFlags
    Running  Lifetime: a 1 s tick → Ticked, merged with Host.steps → ChangedStep
             Ticked, ClickedAdvance → count + step, Command: Host.reportCount
```

## How the host talks to the widget

- **Flags**: `embed` stores them on the wire before mounting. `init` cannot
  take them, so the widget starts `Waiting` and its Lifetime reads them
  (`GotFlags`), as todo and auth do with their saved data.
- **In** (Foldkit's inbound port): `sendStep` calls the listeners of the
  `Host.steps` Stream, which a Lifetime turns into `ChangedStep`. The Stream
  starts with the step now, so a step set before mounting is not lost.
- **Out** (outbound port): each new count is a Command calling
  `Host.reportCount`, which calls the host's listeners.
- **Dispose**: unmounting the React root stops the Runtime, its Lifetimes and
  Commands.

The Shell runs the host page and reads the widget through `useRuntime`,
which reads the one Runtime wherever its component is mounted. Replay works; while it shows the past, the host's "last count"
stays on the live value, since the host is outside the app.

## Deviations

- The host page is drawn inside the Shell, in a `<div>` the route gives it,
  rather than being the whole page.
- `embed` lives in the demo, not the library.

## Blockers

- **No way to run an app outside React, or to talk to it from outside**
  (new, roll-up 19). `toReact` is the only way to run an app with Time
  Travel, and:
  - it is made once with a fixed Layer, so flags and ports cannot be given
    per mount. The wire is one module-level object for the page;
  - its one Runtime is kept in the `toReact` closure: every mount shows the
    same app, so two hosts cannot each have their own;
  - only a View can Send to the root, so a non-React host cannot. Ports had
    to be a Service.

  A `mount(element, { layer, flags })` on the app, returning
  `{ send, subscribe, dispose, useRuntime }` per mount, and typed
  ports declared on the root (`ports: { in: { stepChanged: Schema.Number },
out: { countChanged: Schema.Number } }`, an in-port arriving as a Message
  and an out-port as a Command) would be the API.

- **init takes no input** (blocker 3, which now covers the root as well as
  Children): the flags arrive as a Message after Time 0.

## Testing

Foldkit's story checks that `Ticked` and `ClickedAdvance` add the step and
ask for `ReportCount` with the new count, that `ChangedStep` stores the step,
and that a new step applies from the next tick. A scene draws the widget.

What Effect Oak would need:

- Named Commands (blocker 4) to see "report count 11".
- A typed `Node.step` (blocker 5) from `Running` with a given Model.
- Emitting a Lifetime's Message by hand (blocker 6) for `Ticked`,
  `ChangedStep` and `GotFlags`. Today a test can start the Widget under
  `Runtime.start` with a stub Host Layer and drive the wire, which also tests
  the ports.
