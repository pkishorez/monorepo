# Surfaces own focus, and remember it by named Focus Spots

Entering a Surface used to move focus to its first element, and only with Vim Mode on. In a real app that was wrong in three ways. Switching sessions remounts the page, so the editor that had focus is a new element and focus falls to the page itself. Closing a picker left focus on the page's container, or on the button that opened the picker, instead of the editor the user was typing in. And with Vim Mode off, nothing came back at all.

So a Surface remembers where focus was in it by a name, a Focus Spot the app marks with `useFocusSpot(surface, name)`, and never by element. Whatever element draws that name when the user comes back gets focus. A Surface can name a default spot, so the page sends focus to its composer before the user has focused anything there. Coming back to a Surface by any route puts focus back, with Vim Mode on or off: an Action, the app's `enter` and `leave`, Escape, an Isolated Surface closing. So does a spot remounting while its Surface is Active, if focus was in that Surface and fell to nothing. A spot names its Surface itself, as a Surface's elements do: the Keys tree decides, not the DOM. Focus still moves the user in, never out, and the package never takes focus from somewhere else.

## Considered Options

- **Remember the last focused element**: rejected. A remount gives a new element, and the memory points at one that is gone.
- **Find the spot from a data attribute in the Surface's elements**: rejected. The package cannot tell when it mounts, so a remounted editor would never get focus back without a timer or a DOM observer.
- **Restore focus only with Vim Mode on, as before**: rejected. Losing the editor after a picker closes hurts every user, not only Vim users.
- **Let each component library return focus on close, as Base UI does**: rejected. It returns focus to the trigger or the element focused before opening, which is the bug, and it races the Surface's own return.

## Consequences

- With Vim Mode off, coming back to a Surface now moves focus, but only to a Focus Spot; without one, focus stays where it is, as before. With Vim Mode on, a Surface without a spot still focuses its first element.
- Escape leaving a field focuses the Surface's own element, and the Surface remembers that, so coming back stays in Normal Mode instead of jumping into the field.
- An app turns off focus return in its dialog and popup components, such as Base UI's `finalFocus={false}`, and lets the Surfaces own focus. A popup dismissed by the component itself, such as by a click outside, calls `leave` so focus comes back.
- A spot should be the field itself, or an element around it: focusing a spot focuses the first element in it that takes focus.
