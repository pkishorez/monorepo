# Demos

Two groups. `concepts/` is one demo per concept of Effect Oak, in the order
to learn them: each adds exactly one concept and draws it as shapes that
move, in the vocabulary of `concepts/CONTEXT.md`. Later steps reuse the
Actors of earlier ones, so each demo folder holds only its new Actor, its
View, a `notes.md` and a test. `apps/` holds the Walkthrough's tutorial app
and its storyboard. Every demo runs in `shell/`.

## Concepts

| #   | Demo                                               | Concept                                | The picture                                                                  |
| --- | -------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | [actor](concepts/actor/notes.md)                   | Actor: Model, Message, Update          | A Circle with a number. Click it and a Marble lands; the number changes.     |
| 2   | [states](concepts/states/notes.md)                 | State, Transition, State data          | A Circle sliding between the Slots Closed, Open and Locked.                  |
| 3   | [children](concepts/children/notes.md)             | A fixed Child a State Invokes          | A Slot that grows the Counter at the end of a Line, and loses it on leaving. |
| 4   | [keyed-children](concepts/keyed-children/notes.md) | Keyed Children, Input, `Actor.many`    | A row of Circles, one per player, popping in and out with the Model.         |
| 5   | [commands](concepts/commands/notes.md)             | Command: one errand, one Message back  | A Path to the Edge while a roll runs; one Marble comes back.                 |
| 6   | [workers](concepts/workers/notes.md)               | Worker, the four Conditions, Finalizer | Rings around a Circle, one per Condition that holds, feeding it Marbles.     |
| 7   | [capabilities](concepts/capabilities/notes.md)     | Requires, Provides, Request            | A Band down to the Children and Marbles climbing back up.                    |

## Apps

| Demo                               | Note                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [rockets](apps/rockets/notes.md)   | A Rocket, its States and Workers, a Fleet of them, and the Fleet's Capabilities: four apps, one plain look. |
| [showreel](apps/showreel/notes.md) | The Effect Oak Walkthrough's Storyboard: every beat, playable, and the frame the video records.             |

## Wiring a demo

- Code lives in `<group>/<slug>/`, a deep module. `index.ts` exports the Actor and its View (and the Layer, if the app needs Capabilities).
- The route `src/routes/demos/<group>/<slug>.tsx` makes the app with `toReact(Actor, View, layer)` and shows it in the Shell with `<DemoMenu />`. `head: ({ match }) => demoHead(match.fullPath)` takes the title and description from the demo's entry.
- Each demo has an entry in `DEMOS` in `src/lib/demos.tsx` with its `group`. The home page and the menu group demos by it.
- `laymos.config.json` allows each demo's imports.
