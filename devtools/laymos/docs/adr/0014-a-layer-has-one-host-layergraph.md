# A Layer has one Host LayerGraph

The Layers <> Modules view draws one lane per LayerGraph, and a Layer belonging
to several lanes was drawn as one box stretched from the leftmost member lane to
the rightmost. Membership was computed by unioning both ends of every Rule, so a
LayerGraph appeared to contain every Layer it merely depended on. In std-toolkit
that made 11 of 51 Layers into spanning rails, two of which crossed the entire
canvas and six lanes that did not reference them at all. Counting only the
Layers a LayerGraph declares Rules _from_ produces zero such Layers in that same
Config.

Geometry could not repair this. Every one of the 3,628,800 orderings of
std-toolkit's ten lanes was tested and none makes all spans contiguous, so any
layout encoding membership as horizontal extent must misrepresent some Layer in
some Config. The picture also contradicted the model: CONTEXT.md already
described a LayerGraph as an organizational grouping that _references_ a subset
of Layers, never one that contains them.

A LayerGraph now hosts the Layers it declares Rules from, and reaches the Layers
it names only as Rule targets. Reaching a Layer is a dependency, which is the
opposite of owning it. A leaf, which no LayerGraph declares Rules from, is
hosted by the LayerGraph declaring the most Rules into it, ties breaking on
declaration order. Every Layer therefore has exactly one Host LayerGraph and one
box of one width; the spanning rail and the per-lane target handles that fed it
are deleted rather than corrected.

A lane that reaches a Layer it does not host draws a Layer Reference: an
outlined citation carrying the Layer's id and its Host LayerGraph, which never
expands to Modules and which selects the real Layer when clicked. Every declared
Rule is then drawn inside the lane declaring it, terminating on a local Layer
Reference, so no Rule crosses the canvas at rest. The true crossing Rule appears
only while a Layer is focused, which is when "where does this Layer live?" is
the question being asked. A Violation keeps crossing the canvas unconditionally:
it is by definition an undeclared dependency, so no Layer Reference stands in
for it, and looking alarming is its job.

Selecting a LayerGraph emphasizes what it hosts and what it reaches together,
and draws the true crossing Rules to the Layers hosting its dependencies. Lanes
answer "what is this made of" on their own; the selection is what answers "what
does it lean on", which is otherwise invisible once each Layer sits in one lane.

Selection alone still spreads a LayerGraph's dependencies across the full width
of the canvas, so an opt-in isolation setting keeps only the selected LayerGraph
and, of every other one, only the Layers it actually reaches. Isolation drops
Layer References rather than keeping them: once the lanes are adjacent the real
Layer is close enough to draw the Rule to, and a Reference beside its own
referent would read as two Layers. Which Layers survive follows declared Rules,
not transitive reach, for the same reason References do.

References follow declared Rules only. Transitive reach would be truer to
enforcement and was rejected on measurement: in std-toolkit it produces 77
References against 51 Layers, with one lane gaining 18 References beside 7
hosted Layers, where direct Rules produce 20 References and widen the canvas by
22 percent. Enforcement stays transitive; the drawing stays declared.

Two smaller rules follow. Lanes are ordered to minimise the total distance
Rules travel between them, because declaration order in JSON is an accident of
editing — on std-toolkit this scores 42 against 71, matching the brute-forced
optimum. And a LayerGraph is no longer dropped for owning no Layer exclusively;
it is dropped only when the view's own filter hides everything it references,
so a declared LayerGraph that merely wires other people's Layers together stays
visible instead of vanishing unexplained.

The cost is vertical sparsity. Ranks remain global so that every Rule reads
downward and depths compare across subsystems, which leaves lanes hosting both
shallow and deep Layers filling as little as 30 percent of their span. Layer
References fill much of that gap with the Layers that explain it. Per-lane ranks
were rejected because they would let a dependency edge point upward.

This is the Layers half of the view. The Modules half shares the engine and so
loses its rails too, but does not yet draw Layer References: its Layer boxes are
sized by Module count, and a Reference has no Modules, so it needs a sizing rule
that does not disturb rank alignment.
