# Evolving Schema

Part one of three.

A schema that never changes is easy. This part is about the other kind.

One `Note` runs through every Story here, and it changes four times:

| Version | What changed                       |
| ------- | ---------------------------------- |
| v1      | a note has a `body` and a `colour` |
| v2      | notes can be `pinned`              |
| v3      | `colour` is dropped                |
| v4      | `body` is renamed to `text`        |

Each change is a _rung_. A note written at any version climbs the rungs above it
the moment something reads it, and arrives as the shape today's code expects.
Nothing is rewritten in storage to make that happen.

Start with **Defining evolutions**, which builds that ladder one rung per Story.
Everything after it starts from the finished ladder.
