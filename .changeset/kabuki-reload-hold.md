---
'@kestack/kabuki': patch
---

`Router.reload({ anew: true, hold: true })` holds the data shown until the new data comes, however long, rather than up to the Router's `delay`: no page shows it is loading, and the new data takes the old's place in one step. The Command ends once the reload lands, or once a move takes its place, so the Update that asked can show the wait itself, as an Account Switch does.
