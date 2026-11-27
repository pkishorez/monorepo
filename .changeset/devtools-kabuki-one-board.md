---
'@kestack/devtools-kabuki': patch
---

A Kabuki Session's calls are now `history`, `step`, `look`, `preview`, `fork`, `send`, `world` and `control`. `history` streams light entries; `step` answers the tree at one Step with what its Message changed and who sent it; `look` answers one Instance whole with the Messages it takes. `blueprint`, `watch`, `travel` and `fakes` are gone, and `Seeking` is now `Previewing`.

`step` gives each node its State data, Model and Props, and each Worker how it runs: `always`, `while` or `each`.

The Inspector is one Board: no Running, Blueprint or World tabs. The tree runs left to right and moves only what a Step changed. ⌘ or Ctrl and the wheel zooms at the cursor, only a drag pans, two fingers pinch and pan on touch, and buttons zoom in, out and to everything. A card shows an Instance's name, Actor, State, key, Model, Props, State data, Workers and what it provides, one line per value, and highlights what the Step changed. The Message a card took sits on top of it, with an arrow from the Worker that sent it, or along the tree from the card that did. Opening a card shows the Instance whole and a form for each Message it takes. Picking a Step no longer moves the app; a setting previews it in the app, and another shows what a Step removed.

A number shows as a time only when it is a whole number of milliseconds between 2001 and 2100; a larger one, such as `Number.MAX_SAFE_INTEGER`, no longer stops the Inspector from drawing.

`step` gives each Message the Emits it asked for and what each became in the parent. The Message sits as a chip above the card that took it, with a curve from the card or Worker that sent it, labelled with what carried it, and opens a dialog: how it got there, Step by Step back through Emits and Commands, its payload as JSON, what it changed and what it asked for. A card's rows, section titles and header are all clickable and highlight on hover; changed rows are amber, added green and removed red, and a changed value opens as one inline diff. A card's State has a block of its own under its name, the State it left struck out beside it and the fields that State carries beneath it; an Actor with no States shows none. A changed row shows only its new value until you click it, which shows what it was; the setting "Show what changed values were" shows that on every changed row. A card with more than eight Children shows five and folds the rest behind a card that finds and picks them, or shows them all; a Worker that runs per key lists its keys the same way. A list the server cut short shows its real length. Every setting switches from anywhere on its row.

On the Timeline, a Message sent again to the same Instance is a short tick, so the Steps that differ stand out.
