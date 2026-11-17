# @kestack/dune

Real, interactive HTML drawn into a canvas and lit by shaders: lighting, lamps, and effects of your own.

## Big picture

Chromium's HTML-in-Canvas API lets a page put real HTML inside a `<canvas>`.
The browser lays it out and paints it as usual, but hands the pixels over as
a texture instead of showing them. Dune draws that texture through shaders,
then tells the browser where the HTML ended up, so clicks, focus, typing and
screen readers still reach the real elements. To the user it is a normal
page; to the GPU it is a texture.

The core is plain TypeScript and WebGL2. One Engine per canvas copies in the
HTML's snapshot whenever the browser paints, and runs the Effects over it in
order. It draws only when something an Effect reads has changed, so a still
page costs nothing between changes. An Effect is one GLSL function with
typed Params, plus an optional `prepare` stage for costly work that only
changes with the HTML. `lighting` is one, written the same way as yours.

`@kestack/dune/react` wraps the core: `<HtmlCanvas>` makes the Engine, and
`<Lamp>` makes any element a light source. Where the browser has no
HTML-in-Canvas API, the children are drawn as plain HTML.

One thing the canvas cannot see: an animation the compositor runs on its
own. The browser animates `opacity`, `transform` and `filter` from CSS or the
Web Animations API there, without painting, so the snapshot shows only where
they end. Run them on the main thread instead: in Motion, an element with an
`onUpdate` keeps its animations there.

Terms are in [CONTEXT.md](./CONTEXT.md) and decisions in
[docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @kestack/dune
```

Peer dependencies, both optional and needed only for `@kestack/dune/react`:

- `react` (`^19.0.0`): the components and hooks.
- `react-dom` (`^19.0.0`): renders the canvas and its children.

## Exports

### `@kestack/dune`

| Export               | What it does                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `defineEffect`       | Defines an Effect from GLSL and Params; call the result with Param values to use it.         |
| `num`                | A number Param: its default, range and step, drawn as a slider.                              |
| `color`              | A colour Param, written as `#rrggbb`, drawn as a picker.                                     |
| `lighting`           | A light that follows the pointer, with shadows, a sheen on edges, ambient light, and Lamps.  |
| `Engine`             | Draws one canvas's HTML through its Effects; the React binding makes one per `<HtmlCanvas>`. |
| `detect`             | Says which HTML-in-Canvas API the browser has: `current`, `legacy` or `none`.                |
| `canvasAttributes`   | The attributes a canvas needs to draw its child, under either API.                           |
| `drawableAttributes` | The attribute the canvas's child needs under the current API.                                |
| `ShaderError`        | Thrown when an Effect's GLSL fails to compile, with the log and the numbered source.         |

### `@kestack/dune/react`

| Export                 | What it does                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `HtmlCanvas`           | Draws its children into a canvas through the given Effects; plain HTML where it can't. |
| `useHtmlCanvasSupport` | The browser's HTML-in-Canvas API, or `pending` while rendering on the server.          |
| `Lamp`                 | A box that gives off light in its colour inside an `<HtmlCanvas>`.                     |
| `useLamp`              | Makes any element a Lamp: put the returned ref on it.                                  |

## Usage

### A lit page

A form and a button, real and clickable, under the pointer light. The Deploy
button is a Lamp: it lights what is around it and keeps its own colour.

```tsx
import { lighting } from '@kestack/dune';
import { HtmlCanvas, Lamp } from '@kestack/dune/react';

export function Dashboard() {
  return (
    <HtmlCanvas effect={lighting({ ambient: 0.7 })} contentClassName="p-8">
      <div className="rounded-2xl bg-zinc-900 p-5">
        <label>
          Name <input defaultValue="aurora" />
        </label>
        <Lamp color="#ff7a3d" intensity={1.4}>
          <button onClick={() => deploy()}>Deploy</button>
        </Lamp>
      </div>
    </HtmlCanvas>
  );
}
```

- The children stay in the DOM: the input types and the button clicks.
- The Engine redraws when the HTML repaints, the pointer moves or a Lamp
  changes, and is idle otherwise.
- `lighting`'s height map is built in `prepare`, once per change of the
  HTML; each frame only moves the light.

### An Effect of your own

```tsx
import { defineEffect, num } from '@kestack/dune';

export const ripple = defineEffect({
  name: 'Ripple',
  params: { strength: num(6, 0, 20, 0.5, 'strength (px)') },
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  float d = length(square(uv) - square(u_pointer));
  vec2 push = normalize(uv - u_pointer + 1e-5) * sin(d * 60.0 - u_time * 6.0);
  return source(uv + push * p.strength * pxUv() * u_pointerInside);
}`,
});

<HtmlCanvas effect={[ripple({ strength: 8 }), lighting()]}>…</HtmlCanvas>;
```

- `p.strength` is the Param; `source`, `square`, `pxUv`, `u_pointer` and
  `u_time` come with every Effect.
- It reads `u_time`, so it draws every frame; Effects that don't are drawn
  only on change.
- Effects run in order: here the ripple, then the light over it.
