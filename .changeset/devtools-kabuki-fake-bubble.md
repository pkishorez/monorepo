---
'@kestack/devtools-kabuki': patch
---

**Added**

- `FakeBubble`, from `@kestack/devtools-kabuki/fake`: a round button over the app in fake mode, dragged anywhere (or moved with Shift and an arrow) and kept there, that opens the Fake World: every Fake's Instances from the root down, a keyed Child by its key, each with its State and its Model to fold, and a form per Control its Actor takes, read from the Message's Schema (text, number, switch, a choice of literals, else JSON; optional fields left out when blank). A Control is Sent to the Instance's Address from `FROM_BUBBLE` and says what became of it; the log lists every one sent. Start fresh asks, then reloads the tab with nothing kept. Drawn in a Shadow DOM with its own styles, it follows the page's `color-scheme`.
