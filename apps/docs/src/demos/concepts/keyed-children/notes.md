# 4. Keyed Children

A keyed Child exists for as long as its key is in the parent's Model, and
starts from the Input the parent hands it.

The Scoreboard keeps a list of player names. `players: Actor.many(Player)`
Invokes one Player per name, keyed by that name, with Input `{ name }`. A
Player is a Counter that keeps its name in its Model.

## Click

- Chip "Add player": AddPlayer. A new name joins the Model and a Player grows
  in at the end of its Line.
- Chip "Remove last": RemoveLast. The last name leaves the Model and its
  Player shrinks out, count and all.
- A Player's Circle: its Increment. Only that Player changes.

## Watch

- The Scoreboard's Model holds only names and `next`; each count lives in
  its Player. The parent keeps the key, the Child owns its data.
- In the Strip, each Player has its own lane, `Scoreboard/players[P-2]#1`
  and so on. Remove a Player and its lane ends; a Message to it is dropped,
  drawn as a hollow Marble.
- In the devtools, an AddPlayer or RemoveLast Change lists the Player
  starting or stopping, while an Increment changes one Player's Model only.
