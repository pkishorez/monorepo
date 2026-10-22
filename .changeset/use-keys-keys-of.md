---
'@kestack/use-keys': patch
---

`keys.useKeysOf(id)` gives an Action's keys as bound now, the user's Bindings over its defaults, wherever the user is, so a button's title can name the keys that press it whether or not the Action works from where the button is drawn.

Leaving a Surface puts focus back at once when the place it goes back to is there, so focus is out before the Surface is drawn closed; otherwise once React has committed, as before. Focus resting on the way in an element of no Surface, such as a dialog's popup focusing itself as it closes, no longer stops it going back, nor a Focus Spot remounted after taking it back.
