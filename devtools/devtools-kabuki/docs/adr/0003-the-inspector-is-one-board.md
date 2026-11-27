# The Inspector is one Board

**Status:** accepted

Decided from three prototypes of one runtime view (Ledger, Board,
Spotlight), each over the same scripted app.

**One view, no tabs.** Running, Blueprint and World are gone. The Inspector
shows the app's Instances at one Step as cards in a tree, and the timeline
under them. What a Blueprint said about an Instance, its States and the
Messages it takes, is read when its card is opened. The FakeWorld keeps its
calls, `world` and `control`, and gets its own view later.

**The tree runs left to right.** A Child sits to the right of its parent,
joined by a square elbow, so the tree reads as a diagram. Moving to
another Step animates only what changed: a card that moved slides, a new
one fades in, a removed one fades out. ⌘ or Ctrl and the wheel zooms at
the cursor, a drag pans and the wheel alone does nothing, two fingers pinch and pan on touch,
and three buttons zoom in, zoom out and show everything.

**A card is a readout; a Step marks its diff.** A card is set in the
interface's own type, not monospace. Its header is the Instance's name, its
Actor, its State, `was → now` when the Step moved it, and its key with a
copy button. Under it, flat sections: Model, Props, the State's data, then
Workers, each saying how it runs, `always`, `while` or `each`, and
`in <State>` when only that State runs it, then what it Provides. Every value is
one line: a long string is cut and gets a copy button, an object is a `{…}`
that opens a JSON viewer. A row the Step changed has a soft accent
background; a changed value shows before → after, and a changed object
shows only its new value, with before and after in its viewer. What a Step
removed is hidden unless the panel's setting shows it. So `step` sends each
node's data, Model and Props, and each Worker's kind, beside the tree.

**Colour is spent on the Step.** Structure is neutral. Blue is only the
Message: its chip, its arrow, and the row of the Worker that sent it. A
changed row is amber, an added one green and a removed one red, each a
light tint with a bar on its left edge, so a change reads without colour
too.

**Who sent the Message is drawn on the Board.** The Message is a chip of
its own just above the card it was sent to: its tag, its first field and
its Step. A dashed curve runs straight to the chip from the card that sent
it, or from the row of the Worker that did, and is labelled with what
carried it: `emits Toggled`, `save command`, `load worker`. The Board
keeps both ends in view. Tree edges are curves too. A Message from
a View or from outside has no arrow, only a mark on the chip. The chip opens
the Message: how it got there, walked back through the entries' parents
from an Emit to the Message its Child took and from a Command's answer to
the Message that asked for it, up to eight Steps; its payload as JSON; what
it changed; and the Commands and Emits it asked for, each with what it
became. `step` sends each Message's Emits for this.

**Every row is a button.** A changed row shows only its new value, tinted;
clicking it shows what it was under it, and clicking again hides it. The
setting "Show what changed values were" shows it on every changed row at
once, so the Board stays short by default. Any other row opens its value as
JSON, and a changed row's braces open one diff of the two, with only the
changed lines marked and long runs of unchanged ones folded. A section's
title opens the whole section; the header opens the Instance. Each
highlights on hover. The State has a block of its own under the name, and
the State it left shows the same way as a changed row's old value.

**Opening a card asks `look`.** The dialog shows the Instance whole, its
States, and a form for each Message it takes now. Messages go to the app's
Head, so the forms wait while a past Step is shown.

**Picking a Step does not move the app.** It asks `step`. The app draws the
Step only while the panel's preview setting is on; `Fork here` moves its
Head.

**Rejected.** Ledger, an indented text outline, read fastest but could not
show who sent a Message to whom. Spotlight, the diff alone beside a folded
tree, lost where in the tree a change happened.

**Many Children fold.** A card with more than eight Children shows five:
the ones the Message went to or came from and the ones picked always, then
the ones the Step changed, then the first. The rest wait behind a card that
says how many there are and how many of them the Step changed; it finds one
by key or State and puts it on the Board, or shows them all. A Worker that
runs per key stays one row, and its count opens a list of every key, found
the same way. A list the server cut short counts what it left out.
