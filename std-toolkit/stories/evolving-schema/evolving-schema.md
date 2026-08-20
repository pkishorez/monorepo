# Evolving Schema

This is part one of three.

A schema that never changes is easy. This part is about a schema that changes.

One `Note` runs through each Story here. It changes four times.

| Version | Change                             |
| ------- | ---------------------------------- |
| v1      | a note has a `body` and a `colour` |
| v2      | a note can be `pinned`             |
| v3      | `colour` is removed                |
| v4      | `body` becomes `text`              |

Each change is one step. A note keeps the version it was written at. When
something reads the note, the note moves through each step above its version.
It arrives in the shape that today's code expects.

The stored data does not change. Only the value that the reader receives
changes.

Start with **Defining evolutions**. Those Stories add one step each. Every Story
after them starts from the completed schema.
