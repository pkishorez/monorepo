# Counter

Status: works

## What was ported

Foldkit's `counter`: a number with −, Reset and +.

```
Counter          one Node, one State; Model { count }
```

Three Messages, each a plain Update. No Commands, Lifetimes or Services.
It is one Node because the app is one piece.

## Deviations

- Buttons are `@kstackz/web-platform` Buttons instead of `@foldkit/ui`.
- No page title. Foldkit's View returns a `Document` with a title. An Effect Oak View draws only its part of the page.

## Blockers

None.

## Testing

Foldkit tests it two ways:

- `story.test.ts`: `story(update, given(model), message(ClickedIncrement()), Command.expectNone(), model(m => …))` runs the pure Update and checks the Model and that no Command was asked for.
- `scene.test.ts`: `scene({ update, view }, given(model), click(role('button', { name: '+' })), expect(text('1')).toExist())` draws the View into Foldkit's virtual DOM, clicks through Update and queries the result by role and text, with no browser.

To test it the same way, Effect Oak would need:

- A typed way to run one Update without the Runtime, like `Node.step(Counter, { model, state }, message, at)` returning `{ model, state, commands }`. Today `Counter.definition.update` can be reached, but it is untyped and keyed by State (`Single` here).
- A way to draw a View from a given Model and State, like `View.render(CounterView, { model, state })` or `Handle.of(Counter, snapshot)`, so React Testing Library can click it with `send` going through Update. Today a View takes a live Handle, which only `Runtime.start` or `Replay` make. The docs app also has no jsdom or Testing Library.
- `Runtime.start(Counter)` with `TestClock` already works for an end-to-end test (see `packages/effect-oak/src/core/tests`).
