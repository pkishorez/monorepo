# Dune

Real HTML drawn into a canvas through shaders. The words below are used the same way in the code, its comments and the docs.

## Language

**Canvas**:
A `<canvas>` whose one child is real HTML the browser lays out and paints but does not show. One Engine draws it. In React, an `<HtmlCanvas>`.
_Avoid_: stage, surface, layer

**Snapshot**:
The HTML's pixels as the browser last painted them, copied into a texture on each `paint` event. Every Effect reads it with `html(uv)`.
_Avoid_: capture, screenshot, frame

**Engine**:
What draws one Canvas: it owns the WebGL context, copies in each Snapshot, runs the Effects over it, and tells the browser where the HTML was drawn so input reaches it. It draws only when something an Effect reads has changed.
_Avoid_: renderer, runtime

**Effect**:
A GLSL function `vec4 effect(vec2 uv)` with typed Params, defined once with `defineEffect` and used as an Instance with Param values. Effects run in order, each reading the one before with `source(uv)`.
_Avoid_: filter, shader (one Effect may be up to three shaders), pass

**Param**:
One tweakable value of an Effect, a number or a colour, read in its GLSL as `p.<name>`. Changing it changes a uniform, never the compiled program.
_Avoid_: option, uniform, setting

**Prepare**:
An Effect's optional stage for work that depends only on the HTML and its Params, such as a height map. It runs at half size when either changes, not every frame, and the Effect reads it with `prepared(uv)`.
_Avoid_: precompute, cache

**Memory**:
An Effect's optional per-pixel state carried from one frame to the next, stepped by its `update(uv)`. An Effect with Memory is Animated.
_Avoid_: feedback, history, buffer

**Animated**:
Said of an Effect that changes with time, by reading `u_time` or `u_delta` or keeping Memory. A Canvas with one draws every frame; any other draws only on change.
_Avoid_: live, dynamic

**Lamp**:
An element in the HTML that gives off light: Effects light what is around it in its colour, and it shows its own colour exactly. It is read from the DOM every frame, so it can move or hide like any element.
_Avoid_: light (the pointer's), emitter, glow

**Ambient**:
How bright everything is with no light on it, as a share of its own colour. `lighting` starts at a readable Ambient and the pointer's light only adds to it.
_Avoid_: base, exposure
