# Touch guidelines

How a Web Platform app behaves on a device with no keyboard. Words are the
glossary's: see [CONTEXT.md](../CONTEXT.md) and, for Code, `apps/code/CONTEXT.md`.

## Which test decides what

- **Behaviour follows input.** A touch screen is touch until keys are used: a
  key pressed outside a field turns `useDevice().keyboard` on, and the next
  touch turns it off again. Only a device with no touch screen and a mouse
  that hovers starts as a keyboard one. Without a keyboard it gets gestures and
  no auto-focus. Vim Mode and the keys' status line
  are off there, however wide the screen.
- **A Picker follows the input that opened it**, not the device: keys, a mouse
  or a touch (`pointerType`, a pen counted as a touch). See Choosing from a
  list.
- **Layout follows width.** Below the `md` breakpoint the Sidebar shows in its
  Sidebar Mode; above it, beside the page.
- Never use `useIsMobile` to decide behaviour, only layout.

## Focus

- No focus ring or lit border on touch. While the input last used is a touch
  (`data-input="touch"` on `<html>`, kept by `DEVICE_SCRIPT`), the
  `focus-visible:` and `focus-within:` variants and the `focus-ring` utility
  draw nothing. Keys and a mouse still see them.
- Nothing takes focus on its own. The keyboard rises only when the user taps a
  field or a button made to start typing.
- A component may opt in to focusing a field as it opens. It then appears at
  once, with no animation, and focuses after it is on screen. iOS moves a
  layer that is still animating when a field inside it takes focus.
- iOS raises its keyboard only for focus given in a tap, and such a layer is
  on screen only after it. So the tap that opens it calls `raiseKeyboard`
  (`recipes/touch-layers`): a stand-in field out of sight takes focus in the
  tap, and the layer's field takes it from there once on screen, the keyboard
  staying up.
- While a field has focus, nothing animates: open, close and resize jump.

## Choosing from a list

A Picker is drawn as the input that opened it asks, whatever the device:
keys, a fuzzy list in the middle, search focused; a mouse, a popover by its
button, search focused; a touch, its Picker Mode, nothing focused. A device
with a keyboard opens a Picker in its Picker Mode when it is tapped. The rest
of the screen dims behind every Picker, and a tap or click there closes it.

Whoever opens a Picker chooses its Picker Mode for touch:

- **Drawer** for a few choices with nothing to type: effort, permissions,
  Session Actions, the Draft's Quick actions. It rises from the bottom, animated,
  and closes on swipe down, a tap outside, or a choice that finishes it.
- **Dialog** for a list worth searching: projects, folders, models, Sessions,
  Skills. It sits at the top with the search box above the list, so the
  keyboard never covers a row. It appears and goes with no animation. Its
  search box is not focused unless the Picker opts in. A tap outside with the
  search box focused only takes focus away; a tap outside with nothing focused
  closes it. No swipe closes it.

## Gestures

- Swipe right opens the Sidebar, swipe left closes it, in either Sidebar Mode.
- Swipe a Session row left to right to Settle it; on a Settled row, to
  un-Settle it. It commits past about 40% of the row or on a fast flick, slides
  out with a spring, and offers Undo for 5 seconds. Its Connection is asked at
  once, and Undo asks it back.
- Pull down at the top of the Sidebar to Reload. Scrolled down, the Sidebar
  scrolls instead, wherever the finger lands, a Session row included.
- Swipe down closes a Drawer.
- Every gesture follows the finger and settles with a spring (`motion/react`),
  and jumps instead under `prefers-reduced-motion`, where a busy spinner holds
  still.

## Size and style

- Every control is at least 44px on touch; the main action of a screen, such as
  the Draft's microphone, is the largest thing on it. With no keyboard that
  holds at any width, a tablet's included: compact sizes are for a keyboard
  (the `keyboard:` variant), not for a wide screen.
- What a swipe does must also be reachable without one: a screen reader cannot
  swipe, so the button a keyboard sees stays there for it, out of sight.
- Fewer, larger buttons over rows of small ones. Anything secondary goes in a
  Drawer behind one button.
- Fields are 16px or larger, so iOS does not zoom.
- Respect the safe areas: `env(safe-area-inset-*)` at every screen edge.
