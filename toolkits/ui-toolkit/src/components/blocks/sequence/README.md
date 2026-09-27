# sequence

A minimal toolkit for **forward-driven, step-based animations**. You declare an
ordered list of **steps** — each a `name`, its default `props`, and a `render`
— then a controlled `<Screen>` plays whichever step is active while `motion`
animates the difference between frames. The block owns sequencing and the
animation wrappers; all visual expressiveness is yours via `Div` /
`motion.div` / `layoutId`.

Designed to drop into a blog post: define the steps, hand the controller to
`<Screen>`, and (optionally) `<StepNav>` — two tags and zero wiring.

## The public surface

```ts
import {
  step,
  useSteps,
  Screen,
  StepNav,
  Div,
  motion,
  AnimatePresence,
} from '#components/blocks/sequence';
```

- `step(name, props, render)` — define one frame.
- `useSteps(...steps)` — the controller: `{ active, go, next, prev, restart, index, total }`.
- `Screen` — controlled visualizer: `<Screen sequence maxWidth speed aspect />`.
- `StepNav` — prebuilt Prev / Restart / Next bar: `<StepNav sequence />`.
- `Div`, `motion`, `AnimatePresence` — scene-authoring helpers. (`cw` / `ch` are
  handed to each `render` as its second argument — see below.)

## Mental model

A **step** is one frame: `{ name, props, render }`. The `props` value is _both_
the default for that frame _and_ the source of its type — `render`'s first
parameter is inferred from it, so the contract is written once. `render` also
receives the live **canvas** (`{ u, cw, ch }`) as its second argument.

```ts
step('step1', { items: ITEMS }, (p, { cw }) => <Lineup {...p} />)
//             ▲ default value + inferred type   ▲ render(props, canvas)
```

> Inference narrows to literals. For union props, widen the default at the call
> site: `step('s', { mode: 'grid' as 'grid' | 'stack' }, render)`.

The **list order is the timeline.** A step reused across many frames just
references the same `render` function under different names (`step1 … stepN`).

## Play — `useSteps`

```ts
const seq = useSteps(
  step('step1', { items: ITEMS }, lineup),
  step('step2', { remaining: [], winner: '' }, crown),
);
// → { active, index, total, next, prev, restart, go }
```

- `next` / `prev` walk the declared order (clamped); `restart` jumps to frame 0.
- `go(name)` jumps to a named frame with its default props; `go(name, props)`
  overrides the props for that visit (full props, type-checked — no partial
  merge). `go` syncs `index`, so a following `next`/`prev` stays coherent. This
  is the imperative hatch for dynamic data computed at navigation time.
- `active` is the current frame — hand it to `<Screen>`.

## Render — `<Screen>`

Controlled visualizer; owns no playback state. Pass it the controller:

```tsx
<Screen
  sequence={seq}
  maxWidth={1024}
  speed={0.3}
  aspect={16 / 10}
  className="rounded-3xl border border-border bg-card/60 shadow-xl"
/>
<StepNav sequence={seq} />
```

- `speed` (seconds) sets the default transition every `<Div>` in the scene
  inherits.
- `maxWidth` caps the stage width (px).
- `aspect` sets the design aspect ratio as **width / height** (default `16 / 9`).
  The width is always the 1920 reference; only the height follows — e.g.
  `aspect={1}` for a square, `aspect={16 / 10}` for 16:10.
- `className` styles the stage. It ships with **no chrome** (no background,
  border, radius, or shadow) — bring your own. `overflow-hidden` clips the scene
  to whatever border-radius you set, so a `rounded-*` class is respected.

Scenes are authored against a fixed design **width** (1920); the height follows
`aspect` (default **16:9**). They are **not scaled by a transform**. The stage
fills the available width (bounded
by a viewport-height budget) and a live unit — px per 1% of the stage width — is
measured from the real container. Because elements render at their true
on-screen size, `motion`'s layout projection measures real pixels and corrects
in the same space, so there is no scale-induced jitter. (A CSS `zoom` /
`transform: scale` ancestor would reintroduce it.) The canvas is `relative` +
`overflow-hidden`, so steps can position children with `absolute inset-0`.

## Authoring scenes — `Div`, `cw` / `ch`, `motion`

`Div` is `motion.div` with `<Screen speed>`'s transition baked in — a scene's
common timing lives in one place. All motion props (`layout`, `layoutId`,
`animate`, `style`, …) pass through; a per-element `transition` overrides.

**Size scenes relative to the stage, not in fixed px.** The stage exposes a
`--u` CSS variable equal to **1% of its width**, and hands each `render` a
matching `cw()` / `ch()` (via its second arg) bound to the same live unit
(`cw(1)` === `var(--u)`).

- **In classNames** (static sizes, fonts, gaps): `text-[calc(2.2*var(--u))]`,
  `size-[calc(5.9*var(--u))]`.
- **In animated / JS values** (passed to `motion`): the `cw` / `ch` from
  `render`'s second argument, which return px — e.g.
  `(p, { cw }) => <Div animate={{ width: cw(5) }} />`. (Use these rather than
  the `--u` string for animated props: `motion` can't interpolate
  `calc(var(--u))`.)

`cw` / `ch` are bound to the owning `<Screen>`'s measured unit, so they are
per-instance (no module-global state) and need no hook — they are plain values
on the render's second argument, safe inside step render functions (the block
invokes them as functions, not mounted components).

> Do **not** reach for CSS container units (`cqw`). They require
> `container-type`, whose layout containment desyncs `motion`'s layout
> projection and makes animations jitter. `--u` is a static length with no
> containment, giving the same proportional sizing while keeping motion smooth.

## How animation correspondence works

`<Screen>` renders every frame inside one stable component and inlines the
step's returned JSX. React reconciles frame-to-frame **by position + type +
key**. That determines what animates:

| Element behavior across a frame      | What you must do                                 |
| ------------------------------------ | ------------------------------------------------ |
| Same tree position, props change     | nothing — `<Div layout>` animates it             |
| Reorder among siblings (same parent) | stable `key` per item                            |
| Move to a different parent/container | `layoutId` (only this bridges parents)           |
| Appears / disappears                 | `<AnimatePresence>` + `initial`/`animate`/`exit` |

`layoutId` even bridges across _different step renders_. Plain `<div>` opts an
element out of animation entirely.

## Playback semantics

- **Index lives inline** in `useSteps`. Advancing mid-animation redirects
  elements smoothly to the new target — non-blocking, never queued.
- **Intra-frame choreography** (stagger, delay) is authored with `motion` props
  (`transition`, `staggerChildren`, `delayChildren`) on the JSX a step returns.
- **Side effects** run from a step's own `useEffect` in the rendered JSX — the
  block does not own an effect system.

## Deferred (not in this version)

- **Shape components** (`Box`, `Circle`, …) — for now use `motion.div` +
  Tailwind.
- **A live size/speed menu on `Screen`** — driven by props for now; reader
  controls live in the host page (see the fixture's speed selector).
