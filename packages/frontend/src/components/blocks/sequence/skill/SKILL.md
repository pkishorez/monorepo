---
name: create-sequence
description: Author a smooth, step-by-step animation with the sequence block. Use when building a new sequence scene/slideshow, or when a sequence animation feels janky. Encodes the speed, preset, presence, and structure rules the polished demos follow.
trigger: user-invoked
---

# create-sequence

Build a sequence animation that feels smooth by construction. **Read the
block's [`../README.md`](../README.md) first** for the API (`step`, `useSteps`,
`Screen`, `Div`, `cw`/`ch`, `layoutId`). This skill is only the rules that keep
it smooth — follow all six.

Reference scene that obeys every rule:
`apps/kishore-app/src/routes/blog/_slug/std-toolkit/` (`model.ts` +
`components/` + a thin shell).

## 1. Speed comes from `<Screen speed>`, never hardcoded

Every `Div` inherits the scene's duration from `<Screen speed>` (default
`0.7`). Don't write durations into elements. Need a different tempo for one
element? Scale the inherited one: `speed × factor` — `>1` slower, `<1` faster.
The **only** exception is decorative _infinite_ motion (a pulse, a twinkle):
those use an explicit looping transition and are intentionally outside the
speed system.

## 2. Entry/exit only from presets

Never hand-write `initial`/`animate`/`exit`. Import from the kit:

```ts
import {
  Present,
  enter,
  exit,
  stagger,
  loop,
} from '#components/blocks/sequence';
```

| preset  | enter                    | use                         |
| ------- | ------------------------ | --------------------------- |
| `fade`  | opacity                  | captions, frames            |
| `text`  | opacity + y 6→0          | **any animated text**       |
| `pop`   | opacity + scale 0.9→1    | titles, cards, bars         |
| `scale` | opacity + scale 0→1      | dots, badges, materialising |
| `rise`  | opacity + y 24→0 + scale | hero boxes, tiles           |

Exits mirror these and are **opacity-dominant** (a nested element owns its own
presence lifecycle and can't lean on parent layout, so its exit must not wait
on a transform settling).

**In a mapped list** (items add/remove/reorder), `<Present>` doesn't fit —
spread the preset into each `<Div>` inside an `<AnimatePresence>` instead, so
values still come from presets, never ad-hoc variants:

```tsx
<AnimatePresence mode="popLayout">
  {items.map((it, i) => (
    <Div
      key={it.id}
      layoutId={it.id}
      layout
      {...enter.pop}
      exit={exit.pop}
      transition={{ ...stagger(i) }}
    />
  ))}
</AnimatePresence>
```

Data-driven paint (a role colour/shadow) merges into `animate` on top of the
preset: `animate={{ ...enter.pop.animate, backgroundColor }}`.

**Decorative infinite motion** (pulse, twinkle) is the one exception to
presets — use `loop(period, extra)`, which is outside the speed system.

## 3. Nested presence → `<Present>`, always

Any nested element that mounts/unmounts **or** swaps must go through `<Present>`
so it animates out of the box — never a bare conditional, never a hand-rolled
`AnimatePresence`.

```tsx
<Present when={hasFrame} enter="fade" exit="fade">{label}</Present>
<Present swapKey={text} mode="wait" enter="text" exit="text">{text}</Present>
```

`<Present>` passes `layout`/`layoutId`/`className`/`style`/`transition`
through. Resting at a dimmed opacity? Put `opacity-40` on a **wrapper** — don't
animate opacity to a non-1 value (it fights the preset). See `group-title.tsx`.

## 4. Pick the correspondence mechanism

| element across a frame       | do this                              |
| ---------------------------- | ------------------------------------ |
| persists, props change       | `<Div layout>` — **not** `<Present>` |
| reorders among siblings      | stable `key`                         |
| moves to a different parent  | `layoutId`                           |
| appears / disappears / swaps | `<Present>`                          |
| reordering list              | `<AnimatePresence mode="popLayout">` |

A persistent element (always mounted, just changing) is `Div` + `layout`, not
`Present`. Two traps the demos avoid: **keep height/rotation off the layout
path** (static `style` or an inner `Div`, so projection doesn't fight a
transform); **size animated values with `cw`/`ch`, static ones with `--u`**.

## 5. Orchestrate lists with `stagger(i)`

Cascade siblings instead of snapping them in together:
`transition={{ ...stagger(i) }}`. One helper, identical feel everywhere.

## 6. Structure: `model.ts` + `components/`

- Data, types, slide copy → `model.ts` (no JSX).
- Every piece used in more than one step → its own file in `components/`.
  **Never inline-duplicate a component across steps.**
- A thin shell wires `useSteps` + `<Screen>`.
- Use design-system tokens (`chart-*`, `--radius`) for colour/shadow, not
  hardcoded hex.
