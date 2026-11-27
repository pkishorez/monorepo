---
'@kestack/devtools-kabuki': patch
---

The Inspector shows World beside the Board again, when the app has Fakes: a card per Fake with its state now, and a button per control. A control that takes a payload opens a dialog with a form for it. Running a control does not wait: what it changes shows in the Fake's state, which flashes, and only a refusal comes back, with its reason, until dismissed. On a narrow screen World sits under the Board. `World`, `WorldView` and `hasFakes` are exported from `./devtools`, and the Inspector's Input takes `world`, so a host can place World itself; the in-page Inspector places it.

`kabuki_fakes` heads each Fake `fake <name>`, so its name is never the first letter of the answer, which some clients capitalize: an agent took `Server` for `server` and had its control refused.
