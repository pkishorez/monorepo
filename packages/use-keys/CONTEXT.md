# Use Keys

Keyboard shortcuts for React: every key the page hears, the Shortcuts and Sequences built on top of it, and the Surfaces an app's keyboard is made of. The keyboard counterpart of use-gesture, sharing its ideas but not its zones.

## Language

### Core

**Keys Provider**:
The one place that hears every key on the page for the listeners inside it, keeps the list of them, and calls each Enabled one. It also sets how the app feels: how long a key is held before it Repeats and how often, and how long a Sequence waits for its next step. Every listener must be inside one. One inside another adds nothing: its listeners belong to the outer one. Separate sections may each have their own; each hears every key, and neither knows of the other's listeners. It can turn off every listener in it at once, and it holds Vim Mode and the Active Surface for the Surfaces inside it.
_Avoid_: scope, group, zone, registry

**Key**:
One press of one key, from going down to lifting: which physical key it is, what it means, when it went down and when it lifted. Whether it is still down and how long it was held follow from those times. Shift, Ctrl, Alt and Cmd are Keys like any other. The same key pressed twice is two Keys.
_Avoid_: key press, keystroke, key event, input

**Keys**:
Every Key from the first one going down until the last one lifts, in the order they went down. A Key that lifts stays in them until the last one lifts; then they end and start empty again. Every key that goes down lifts exactly once, and they always end, even when the browser does not say so.
_Avoid_: chord, session, combo, held keys (only the Keys still down are held)

**Enabled**:
Whether a listener hears Keys at all. A listener is Enabled only when it and its Keys Provider both are. The way an app keeps listeners apart: there are no areas that own keys, and the app's own state decides which listeners are Enabled.
_Avoid_: active, focused, scoped

**Watch**:
What a listener does when it hears a Key but leaves it to the browser and the rest of the page. The core only watches, so any number of listeners can watch the same key.
_Avoid_: listen (too broad), observe

**Take**:
A Keys Provider acting on a Key for a Shortcut or Sequence so that nothing else does: the browser does not type it, scroll or move focus with it.
_Avoid_: capture, consume, handle

**Text Entry**:
An element where typing goes into the element: an input that takes text, a textarea, a select, or anything editable. Text Entry keeps its keys: no key typed there is Taken, except one with Ctrl, Alt or Cmd whose Shortcut asks for it. Escape there leaves the Text Entry, unless an element there already used it, or the Escape order of the Surfaces says otherwise; that Escape reaches nothing else, and the next one reaches the page's Shortcuts.
_Avoid_: input (one kind of it), insert mode, field

**Kept Key**:
A key the page never gets to Take: one the browser itself keeps, such as closing a tab; one typed while composing text in another script; one an element or component already acted on; or one typed in Text Entry. Listeners Watch only what is not kept from the page. Shift, Ctrl, Alt and Cmd alone are never kept, since they type nothing.
_Avoid_: reserved key, blocked key

**Taken Over**:
An element, and everything in it, whose keys go to Shortcuts and Sequences before the element itself, even in Text Entry: whatever is Taken never reaches it, and the rest types as usual. Set by the app on that element.
_Avoid_: captured, forced

**Left Alone**:
An element, and everything in it, whose keys no listener ever hears, such as a code editor or a canvas with its own keys. Set by the app on that element. The nearest of Taken Over and Left Alone decides.
_Avoid_: ignored, disabled (as a term), excluded

**Interrupted**:
How Keys end when the page loses focus: at once, with every Key lifted. An unfinished Sequence ends with them.
_Avoid_: aborted, cancelled (that is a Sequence giving up)

### Recognizers

**Shortcut**:
One key going down while exactly a set of modifiers is down, such as K with Ctrl. It matches a moment in the Keys, not the whole of them: Ctrl and K, then Ctrl and J, without lifting Ctrl, are two Shortcuts. It Commits as its key goes down, once, or again on every Repeat when it asks to.
_Avoid_: hotkey, binding, combo, chord, accelerator

**Sequence**:
Shortcuts pressed in order, each within the Keys Provider's time of the one before, such as G then G. Its steps may fall in one Keys or across several. It is Possible from its first step, Commits on its last, and Cancels on a wrong key, a step too late, or Interrupted. It Repeats while its last key stays down, when it asks to.
_Avoid_: chord, combo, multi-key shortcut

**Repeat**:
A Shortcut or Sequence Committing again while the key that Committed it stays down: first after the Keys Provider's delay, then at its interval. Only that last key is held; the steps before it are not pressed again. The package decides it, never the browser's own repeating.
_Avoid_: auto-repeat, key repeat

**Conflict**:
Two Enabled Shortcuts or Sequences in one Keys Provider where the keys of one are the same as, or the start of, the keys of the other, such as G and G then G. Sequences that start the same and then differ do not conflict. Two Actions Conflict only on one Surface; across Surfaces the nearer one Shadows the other.
_Avoid_: clash, overlap, collision

**Commit**:
A Shortcut or Sequence deciding its keys were pressed: a Shortcut as its key goes down, a Sequence on its last step.
_Avoid_: fire, trigger, match

**Cancel**:
A Sequence giving up before its last step, with a reason: a wrong key, too slow, or Interrupted.
_Avoid_: fail, abort, reset

### Surfaces

**Surface**:
A part of the app where the user works with the keyboard, such as a screen, a pane or a dialog. It is the only concept of this layer: every Surface is named in one central definition, the Keys tree, and its Actions are named on it. Its name is unique in the whole tree. The app draws it with any number of elements, anywhere on the page; they are all the same Surface.
_Avoid_: phase, layer, context, scope, zone, screen (one kind of it), frame

**Keys tree**:
How the Surfaces nest, as the definition writes them, and the only hierarchy keys follow. It is independent of the React and DOM trees: an element drawn beside its parent's, or in a portal, still sits where the Keys tree puts it.
_Avoid_: surface tree (as the React tree), component tree

**Keys state drives the UI**:
The Keys Provider holds the Active Surface, and the UI follows it, never the other way round. A Surface can be Active whether or not any element draws it, and entering one always works at once. A panel such as a palette is drawn while its Surface is Active; leaving the Surface closes it.

**Focusable**:
A Surface that can be the Active Surface. Every Surface is, unless it says otherwise; one that is not only holds Actions for the Surfaces inside it, and Escape passes over it.

**Active Surface**:
The one Focusable Surface the user is in right now, held by the Keys Provider: at first the Initial one, else the first Focusable one in the definition. A pointer going down or focus moving inside an element enters the innermost Surface drawn there, or the nearest Focusable one above it; focus can move the user in, never out. An Action, the app, or Escape can move it too. Coming back to one puts focus back where it was in it, as its Focus Spots say.
_Avoid_: current surface, focus, selected pane

**Focus Spot**:
A named place in a Surface where focus can rest, such as the page's composer, marked by the app on an element drawn anywhere; the element is in the Surface the spot names. A Surface remembers the spot focus was last in by its name, never by its element, so the memory outlives a remount; focus landing on the Surface's own element, as Escape leaving a field does, is remembered too. A Surface can name one spot its default. Coming back to a Surface, by an Action, the app, Escape or an Isolated Surface closing, puts focus in the spot it remembers, else its default one, else, with Vim Mode on, its first element; with Vim Mode on or off, and only when focus is not in it already. A spot or element mounting while its Surface is Active takes focus back when focus was in that Surface and fell to nothing. Focus resting in no Surface on the way, such as a closing popup's own element, does not stop it going back. Focus is never taken from another Surface.
_Avoid_: focus target, autofocus, anchor, last focused element

**State**:
How a Surface is drawn, from the Keys tree only: **Active** for the Active Surface, **Parent** for each Surface above it, **Inactive** for every other, and **Off** for all of them while Vim Mode is off.
_Avoid_: around (the old Parent), dimmed

**Appearance**:
The class names a Surface's elements take in each State but Off. A Surface's own fall back, one State at a time, to the Keys Provider's, and those to the default the app's theme draws from the elements' data attributes.
_Avoid_: theme, skin, frame props

**Initial**:
The Surface Active when the app starts. One per definition.

**Isolated**:
A Surface no key climbs out of but Escape, such as a dialog or a palette. Leaving it goes back to the Surface it was entered from. While the user is in it, every Surface outside it is cut off, its Parents included, and a pointer going down outside it enters nothing. It has no Normal Mode of its own: Escape in its Text Entry goes to its Actions.
_Avoid_: modal, trapped, blocking

**Action**:
Something the user can do from a Surface, named in the definition with keys and a label, such as "Next thread" on `j`. A component gives it a Handler, which says what it does; an Action with neither a Handler nor Enters does nothing, Shadows nothing and is not listed. It works from its keys or by being run directly, as from a command palette or a help sheet.
_Avoid_: command, shortcut (that is its keys)

**Enters**:
The Surface an Action enters once its Handler, if any, has run, such as `mod+k` entering a palette.
_Avoid_: opens, navigates

**Bindings**:
The user's own keys, by Action id, handed to the Keys Provider. Each replaces all of that Action's keys from the definition, with the same Conflict checks. They can be checked first, without throwing, for the Conflicts they would make and the Actions they would leave Shadowed, every Action counted as if it had a Handler. A Shortcut for them can be recorded from one key going down, named as keys are matched, so the same key presses it again.

**Vim Mode**:
Whether the app's keyboard is on: a preference the app keeps and hands to the Keys Provider. With it off, only Always Actions work, and every Surface is Off; clicks and focus still move the Active Surface, so the Always Actions work where the user is.
_Avoid_: keyboard mode, power mode

**Always**:
An Action that works with Vim Mode off too, such as opening a command palette. Every other Action works only in Vim Mode.

**Mode**:
Insert while focus is in Text Entry inside the Active Surface, and Normal otherwise. In Insert, plain keys type; only keys holding `mod` reach the Actions, and plain keys only for an Action that asks to work in a field. Ctrl or Alt alone stay with the field, and so does a key the field already used.
_Avoid_: vim state, editing

**Shadowed**:
An Action whose keys do nothing because an Action nearer the Active Surface has the same keys, or keys that start the same. A key climbs the Keys tree from the Active Surface outward, up to an Isolated one; a Surface beside it never hears it. The nearer one always wins, and which one wins is known before any key is pressed: an Action that does nothing Shadows nothing, and none passes a key on. Shadowing is never a Conflict; two Actions on one Surface with the same keys are.
_Avoid_: overridden, bubbled, masked

**Escape order**:
What Escape does, the first that applies: an element already used it; in Text Entry inside a Surface that is not Isolated, it leaves the field for Normal Mode; the Active Surface's own Escape Action runs, never one of a Parent; otherwise it leaves the Active Surface, running every `onExit` of it, for the nearest Focusable Surface above it, or, from an Isolated one, for where it came from, and at the outermost it does nothing. With Vim Mode off, only the first three apply, and leaving only an Isolated Surface.
_Avoid_: escape stack, back
