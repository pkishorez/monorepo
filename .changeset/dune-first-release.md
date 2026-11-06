---
'@kestack/dune': patch
---

First release. Real, interactive HTML drawn into a canvas and lit by shaders, on Chromium's HTML-in-Canvas API. `defineEffect` writes an Effect as one GLSL function with typed Params, and `lighting` is one: a pointer light with shadows, ambient light and colours that keep their hue. `@kestack/dune/react` has `<HtmlCanvas>`, and `<Lamp>` to make any element a light source.
