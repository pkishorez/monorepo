# A Message with no rule anywhere is warned of, not a type error

A Message with no rule in the State the Instance is in is ignored, as in a statechart: a late Command result after a Transition is the common case. A Message with no rule at the top or in any State is always ignored, which is almost always a mistake. `build` checks this once, when the Actor is made, and logs a warning with Effect; nothing is checked per Message at runtime. A misspelled Message tag in `on`, or a misspelled State block, stays a type error.

## Considered Options

- **A rule for every Message in every State, with an explicit `ignore`, like Foldkit's `Message.match`**: rejected. Foldkit's `update` is one flat function, so a Message it does not handle is always a bug. With States, ignoring a Message in most of them is the normal case, and the rule would add lines that catch nothing.
- **A type error for a Message with no rule anywhere**: rejected, because it cannot be made right. A rule that destructures its Message, `({ text }) => ...`, is typed from its context, and TypeScript leaves the whole `on` it sits in out of what it infers for the behavior, so most correct Actors would fail to compile.
- **Throwing when the Actor is made**: rejected. A Message that is always ignored breaks nothing on its own; a warning is enough to find and remove it.

## Consequences

- The check runs when the module that builds the Actor is loaded, so tests and the dev server show it at once, but the editor does not.
- The warning goes through Effect's default logger, which prints with `console.log`.
