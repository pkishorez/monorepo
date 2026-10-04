# Use Keys

Keyboard shortcuts for React: every key the page hears, and the Shortcuts and Sequences built on top of it. The keyboard counterpart of use-gesture, sharing its ideas but not its zones.

## Language

### Core

**Keys Provider**:
The one place that hears every key on the page for the listeners inside it, keeps the list of them, and calls each Enabled one. It also sets how the app feels: how long a key is held before it Repeats and how often, and how long a Sequence waits for its next step. Every listener must be inside one. One inside another adds nothing: its listeners belong to the outer one. Separate sections may each have their own; each hears every key, and neither knows of the other's listeners. It can turn off every listener in it at once.
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
An element where typing goes into the element: an input that takes text, a textarea, a select, or anything editable. Text Entry keeps its keys: no key typed there is Taken, except one with Ctrl, Alt or Cmd whose Shortcut asks for it. Escape there leaves the Text Entry, unless an element there already used it; that Escape reaches nothing else, and the next one reaches the page's Shortcuts.
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
Shortcuts pressed in order, each within the Keys Provider's time of the one before, such as G then G. Its steps may fall in one Keys or across several. It is Possible from its first step, Commits on its last, and Cancels on a wrong key, a step too late, or Interrupted. It never Repeats.
_Avoid_: chord, combo, multi-key shortcut

**Repeat**:
A Shortcut Committing again while its key stays down: first after the Keys Provider's delay, then at its interval. The package decides it, never the browser's own repeating.
_Avoid_: auto-repeat, key repeat

**Conflict**:
Two Enabled Shortcuts or Sequences in one Keys Provider where the keys of one are the same as, or the start of, the keys of the other, such as G and G then G. Sequences that start the same and then differ do not conflict.
_Avoid_: clash, overlap, collision

**Commit**:
A Shortcut or Sequence deciding its keys were pressed: a Shortcut as its key goes down, a Sequence on its last step.
_Avoid_: fire, trigger, match

**Cancel**:
A Sequence giving up before its last step, with a reason: a wrong key, too slow, or Interrupted.
_Avoid_: fail, abort, reset

### Surfaces

**Surface**:
A part of the app where the user works with the keyboard, such as a screen, a pane or a dialog, named in one central definition with the Actions it offers. Surfaces nest: a Surface sits inside another or at the top. While a Surface is Active, its own Actions, those of every Surface around it, and the Global Actions work; a Surface beside it never does. A Surface says what keys can do there, never where the user is.
_Avoid_: phase, mode, layer, context, scope, zone, screen (one kind of it)

**Active Surface**:
The one Surface the app says the user is in right now, and none when the app names none. The app sets it, never a key: moving to another Surface is something an Action's Handler does. With no Active Surface, no Action works.
_Avoid_: current phase, focus, state

**Action**:
Something the user can do from a Surface, with a name and a description, such as "Archive the selected thread". It works from keys or by being run directly, as from a command palette. It works only while it has a Handler.
_Avoid_: command, shortcut (that is its keys), event

**Binding**:
The keys of an Action, a Shortcut or a Sequence: the default from the central definition, or the user's own in its place. One Action may have several; the user's own replace all of its defaults at once.
_Avoid_: keybinding, hotkey, mapping

**Global Action**:
An Action of no Surface, such as opening a command palette, working whichever Surface is Active.
_Avoid_: app action, root action

**Shadowed**:
An Action that does not work because an Action of a Surface inside it, nearer the Active Surface, has the same keys or keys that start the same. The nearer one always wins: nothing a Handler does at the moment passes a key on.
_Avoid_: overridden, bubbled, masked

**Handler**:
What an Action does, given by the app from the component that has what it needs. The central definition never holds it.
_Avoid_: callback, listener, effect
