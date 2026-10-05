# Gestures run the keys' Actions

Status: accepted

Every Command of Ledger is one `@kstackz/use-keys` Action. A gesture never
does the work itself: it runs the Action through `keys.useRun()`, and a
Thumb Lock arm is dimmed when its Action is not active. So the Surfaces —
which Place has the keys, what Add and Settings shut off while open — decide
for keys and fingers alike, and the Settings list of every key and gesture
reads one source.

On a phone the left thumb resting still is the modifier, as Ctrl is on a
keyboard: a second finger's swipe under it is a Command, and a swipe of one
finger is left to the page, so scrolling and the sidebar never compete with
Commands.

## Considered options

- **A shared Surface package for keys and gestures.** Rejected: a Gesture Zone
  already scopes touch by where the finger lands, and a second Surface system
  would duplicate it. Running the keys' Actions gives one vocabulary without
  a new abstraction.
- **Plain swipes as Commands** (swipe down to Jump). Rejected: they fight the
  page's own scrolling and the sidebar's swipe.
- **A press-and-hold before the Thumb Lock.** Rejected: the thumb counts as
  locked the moment a second finger lands while it is still, so feedback
  starts with the first movement.
