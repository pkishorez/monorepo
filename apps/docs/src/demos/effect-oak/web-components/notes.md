# Web components

Status: works. Two custom elements written by hand are drawn by a View; the
picker's events become Messages, and the badge's properties follow the
Model, in Replay too.

## What was ported

Foldkit's `web-components`: a QR designer with two third-party custom
elements, `<hex-color-picker>` (vanilla-colorful) and `<sl-qr-code>`
(Shoelace), sharing state only through the Model.

```
WebComponents (root)   Model { content, fill, background }
                       UpdatedContent, ChangedFillColor, ChangedBackgroundColor
elements/   <oak-color-picker>: a saturation/brightness pad and a hue strip
              in shadow DOM; `color` property; fires `color-changed { value }`;
              arrow keys move it
            <oak-pixel-badge>: a mirrored 7 × 7 pattern from a hash of
              `value`, in `fill` on `background`, on a canvas `size` wide
            hsv.ts: hex to hue, saturation and value, and back
            their JSX types
fields/     the text field, the two color fields (picker, hex, swatches),
            and the preview
```

One Actor: the preview needs the text and both colors, and a parent can
neither read its Children's Models nor hand them data (blocker 13), so a
Child per color field would only mirror the root.

## How custom elements fit

Nothing in Effect Oak was in the way. React 19 does the binding Foldkit's
`CustomElement.define` does:

- A prop that the element has as a property is set as a property, so
  `color={model.fill}` reaches the setter, not an attribute.
- A prop named `on` + an event's name listens to that event, so
  `oncolor-changed={(event) => send(…)}` turns the element's CustomEvent
  into a Message.
- The elements are defined when their module loads, before any View draws
  them; otherwise React would set attributes on the not-yet-upgraded element.

Types are a JSX augmentation (`'oak-color-picker': { color, 'oncolor-changed' }`),
by hand; Foldkit generates typed attributes from Schemas.

Replay sets the properties back to the replayed Model, so stepping moves the
picker and redraws the badge. Dragging the picker sends a Message per pointer
move: a long drag is many Log entries, like any input.

## Deviations

- **No vanilla-colorful or Shoelace.** Both elements were written for the
  demo. The QR code became a pattern badge with the same properties
  (`value`, `fill`, `background`, `size`): a QR encoder is a library's worth
  of code on its own. The demo is now a "pattern designer".
- The picker keeps its own hue while dragging through gray, as
  vanilla-colorful does.

## Blockers

None of its own. One View could not be split into Child Actors (blocker 13),
as above.

## Testing

Foldkit's story checks each Message replaces only its field and that update
never asks for Commands. Its scene draws the designer and checks the typed
properties reach `<sl-qr-code>` and that a `color-changed` event becomes the
right Message.

What Effect Oak would need:

- A typed `Actor.step` (blocker 5) for the three rules.
- Drawing the View from a Model (blocker 5) and dispatching a
  `color-changed` CustomEvent on the element, checking the Message Sent. With
  a DOM test environment, rendering `<WebComponentsView node={…} />` against
  a live Instance from `Runtime.start` can do this today.
- `hsv.ts` is plain functions and testable today (round trips of hex).
