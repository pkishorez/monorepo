# 5. Commands

Status: works

## What it shows

A Command: an errand an Update asks for, one named Effect that ends with at
most one Message. The Dice Actor keeps `{ value, rolling }`. Roll sets
`rolling` and asks for the Command `roll`, which sleeps a second and then
returns `Rolled { value }` with a face drawn inside the Command. The value
travels in the Message, so a Replay lands on the same face without running
the Command again.

## What to click

- The Circle: Roll. While rolling, the Path is drawn from the Circle to the
  Edge; one Marble comes back along it and lands as Rolled.
- Click again while rolling: the Roll is handled but changes nothing, so no
  second Path.

## What to watch

- Strip: a view-coloured Marble (Roll), then a command-coloured one (Rolled)
  a second later on the same lane.
- Devtools: Rolled's Source is `command Dice roll`. Scrub back to Roll and
  forward again: the same value, from the Message, not from Math.random.
