# A Layer reads as a rank stack, wrapped towards a square

A Module Graph already stacked its members by their declared Rules, so a reader
could see which member stood on which. A Layer did not. Free-form Configured
Modules were laid out in a square-ish grid whose row and column meant nothing,
and Module Graph bands were stacked beneath that grid in declaration order. One
canvas therefore used vertical position two ways: dependency inside a band,
nothing outside one. A Layer now arranges its Configured Modules and its Module
Graphs in a single rank stack, where a box sits below everything that depends on
it, and vertical position means the same thing everywhere.

The stack has to come from somewhere, and free-form Modules declare nothing
about each other within a Layer — the only declaration is `shared`. So the ranks
are derived from observed imports, which is the first place in this view where
what the code does moves a box rather than what the Config says. Ranking on
declared visibility alone was rejected as too coarse: it collapses a real chain
into two ranks and reveals nothing the `Share2` icon does not already show. On
std-toolkit, all 22 intra-Layer imports target a Shared Module, and `eschema.domain`
reaches depth 3 only because a Shared Module depends on another Shared Module.

Only imports the Config permits rank anything. `boundaries.ts` already
distinguished them, but kept the permitted set as a private `edges` map while
exporting every import in `dependencies`. Rather than re-derive legality in the
frontend from `shared` plus Layer plus Graph membership — two copies of one rule,
free to drift — each dependency now carries a `permitted` flag. A violating
import ranks nothing: dragging a Module beneath a peer it may not touch would
render the illegal arrangement as though it were the intended shape, and laymos
already reports violations through a louder channel.

The imports behind the stack are drawn. Leaving them to position alone was tried
first, on the argument that declared structure is drawn while observed structure
is only positioned, and it failed in use: a reader cannot tell whether a box sits
below another because it depends on it or because the rank wrapped onto a second
line. Both look like a box under a box. Permitted same-Layer imports are now
drawn as solid muted edges, distinct from the dashed edges a Module Graph uses
for its declared Rules, and a pair already joined by such a Rule is not drawn
twice. std-toolkit draws 25 of them and the `ui` Layer 28 — few, short, and
almost all pointing from a Module to the Shared Module directly beneath it.

Depth is not negotiable — it is what the dependencies are — so width is the only
free variable, and it is spent on making the Layer square. A rank wraps onto as
many lines as the column count requires, and the column count is the one whose
resulting block has the aspect ratio nearest to 1. This subsumes the old grid
instead of competing with it: a Layer whose Modules import nothing from each
other becomes one rank, wrapped, which is the grid. Choosing columns by
`ceil(sqrt(module count))` as the grid did was measured and rejected — it ignores
the shape of the DAG and produced a 1620x664 `ui` Layer, ratio 2.44. The square
rule gives 1020x960, ratio 1.06.

Layers get taller and considerably narrower, and because Layer width drives lane
width drives canvas width, the whole canvas shrinks: std-toolkit from 7060 to
5900 pixels, the frontend from 1684 to 1084. That directly relieves the
horizontal travel between a LayerGraph and its dependencies that LayerGraph
isolation was introduced to fix. Some Layers cannot be squared — `sqlite.drivers`
is a chain of four Modules and stays 220x368 at one column — and that is the
correct picture of a chain.

A Module Graph takes a rank like any other participant, but occupies its own
line within it rather than packing beside Modules; a Module box tucked into the
gap beside a bordered, headed container reads as being inside it. Within a rank,
peers stay alphabetical. Ordering them to minimise edge crossings was rejected:
with depth at most 3 and every edge pointing at a Shared Module there is almost
nothing to gain, and a Module that moves because an unrelated import appeared
elsewhere in the Layer is worse than one you can find by name.

Wrapping still puts peers of one rank on separate lines, which is the same
visual idiom as a rank boundary; the gap distinguishes them — 44 pixels between
ranks against 16 between wrapped lines — and the drawn edges settle any case
where that reads as ambiguous. What remains unresolved is the cycle: two Modules
that import each other cannot be ranked, so one is drawn above the other and its
edge points upward. That is a Module cycle violation and belongs to the violation
channel, not to the stack.
