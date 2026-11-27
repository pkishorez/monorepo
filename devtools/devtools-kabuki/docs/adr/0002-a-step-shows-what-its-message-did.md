# A Step shows what its Message did

**Status:** proposed

Builds on Kabuki's
[ADR 0052](../../../../packages/kabuki/docs/adr/0052-what-a-message-did-is-worked-out-and-an-emit-is-played-next.md):
a Change per Message, Chains read from the History's order, and the Work
report. The Inspector
and the MCP tools are rebuilt around one question, what did this Message do,
and answer it from the same data.

**The canvas shows what exists; a Step shows what changed.** A card shows
an Instance's name, its State and its Model, and nothing else: no Messages,
no counts. Picking a Step keeps the whole tree and draws only its Change on
it: the Message as a bubble on the card it was Sent to, with who Sent it; the
Model fields it changed marked, and the rest left plain; a new State in
yellow; a card added or removed; each Command it asked for as a chip; each
Emit as an arrow of its own colour to the parent, which the parent's Step,
next in the Chain, picks up. A Worker is a small mark on its card's edge, and
a Message it Sends is a line from it into its card. Opening a bubble, an
Emit or a chip shows its payload.

**The timeline is Chains.** A Chain is a Message and the Emits it set off,
played one after another, so the timeline reads them from the order: each
is one block, and a Chain of the same Message changing nothing again and again
is folded into one, `TunnelReachable ×9`. Dragging or scrolling moves through
time; picking a block shows the end of its Chain; opening it lists its Steps,
which the arrow keys walk one at a time.

**At the Head, the Work report is drawn over the data.** Where the running
app differs from what its data asks for, the canvas says so: a Worker done
gets a grey ring, one failed a red ring and its failure, a Command still
running a chip with its time, a Provide that failed its failure. A past Step
has none, and a pill says what the Head has, "1 Worker failed", to go back.

**Values are printed, not dumped.** One printer, shared by the panel and the
MCP tools, writes a value as indented `key: value` lines, short values on
one line, strings unquoted where they are plain, and says where it cut a
value short.

**The wire carries Steps, not Histories.** `watch` sends each new entry once,
after a cursor the panel holds: its id, Source, Time, outcome, its
Message encoded by its Actor's Schema and trimmed, and its Change, worked out
in the tab by replay and remembered. An epoch changes when the History is
started over, Compacted past the cursor or Forked, and the panel then asks
again from the start. `look` at the Head also gives the Work report, so the
calls stay eight.

**An agent gets the same, as text.** `kabuki_look` gives the tree and, first,
any failures in the Work report. `kabuki_timeline` gives Chains, filtered by
Instance, Message or failure. A Step's Change, payloads included, is one call.
`kabuki_send` answers with the Chain its Send began once the app is Settled,
not after a guessed pause.

## Considered options

- **Keeping the per-card Messages, counts and every State's detail on the
  canvas.** Rejected: they hide the two things a card is looked at for, its
  State and its Model. What an Instance takes is in its detail, and what it
  did is in the Step.
- **One tick per entry on the timeline.** Rejected: a Worker's heartbeat
  buries the one Message that mattered, and an Emit's entry looks unrelated
  to the Child's that made it.
- **Comparing whole Snapshots in the panel.** Rejected: the tab already has
  the Actors' code and the Snapshots, so it works the Change out once, for the
  panel and the agent alike.
- **A ninth call for the Work report.** Rejected: it is only ever read at the
  Head, which `look` already is.

## Consequences

- `watch` no longer resends the whole History on every change, and its
  stream no longer keeps only the latest value, which would drop entries.
- The contract's own `Entry` and `Change` types give way to Kabuki's.
- The printer and the trimming move out of `server/mcp` to a module the
  browser and the server both import.
