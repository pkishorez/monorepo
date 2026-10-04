# Shadowing is static: the nearest Action wins, and no Handler passes a key on

When an Action of the Active Surface and one of a Surface around it, or a Global Action, have the same keys, the nearest one wins and the others are Shadowed. Which one wins is known before any key is pressed: an Action with no Enabled Handler shadows nothing, and a Handler cannot decline a key it was given, as DOM events do by bubbling. We chose this so that the list of what works right now, shown in a cheat sheet or a command palette, is never wrong.

## Considered Options

- **Runtime bubbling, where a Handler returns `false` to pass the key outward**: rejected. The list could say Escape discards the draft while it does something else.
- **No repeated keys along a path at all**: rejected. A dialog giving Escape its own meaning is the main reason to nest Surfaces.

## Consequences

- A Handler that sometimes cannot act turns itself off with `enabled` instead of declining.
- Shadowing is never a Conflict; a Conflict is two Actions with the same or overlapping keys at the same level.
- Running an Action by id ignores Shadowing, since Shadowing is about keys only.
