# Rules point at the real Layer, not at a stand-in

ADR 0014 gave every Layer one Host LayerGraph so that no Layer was drawn as a
rail spanning several lanes. To keep every Rule inside the lane that declared it,
it also introduced the Layer Reference: an outlined stub drawn in a lane that
reaches a Layer but does not host it, carrying the Layer's id and its host's
name. A Rule reaching out of its lane landed on the stub, and the true Rule
between the two real Layers was drawn only once something was selected.

That traded one confusion for another. A reader now saw the same Layer id in
several lanes and had to learn that one of them was the Layer and the rest were
citations of it — a distinction carried by a dashed border and a smaller caption.
Counting was ambiguous, the stub had no Modules while looking like a box that
should, and the true dependency stayed hidden until you clicked. LayerGraph
isolation had already had to suppress References entirely, because a stub one
lane away from its own referent read as two Layers; that exception was the signal
that the whole device was wrong. References are removed. A Rule is drawn between
the two real Layers it names, wherever those Layers are drawn.

A Rule that leaves its lane therefore crosses the canvas. It is dashed and drawn
above in-lane Rules, so the eye can still separate a dependency inside one
responsibility from one that reaches into another — which was the legible half of
what References bought, kept without the stub. Rules are merged before drawing,
so two LayerGraphs declaring the same Rule produce one line rather than two
overlapping ones; previously they landed on different stubs and so did not
collide. The separate always-crossing overlay that appeared on selection is gone,
because the Rule it duplicated is now permanently on screen.

Lanes size to the Layers they host alone, which makes them narrower. A LayerGraph
that hosts no Layer now draws no lane, where before it drew a lane of nothing but
References. It is also removed from the LayerGraph dropdown, since selecting a
LayerGraph with nothing on screen would emphasize nothing; its Rules are still
enforced, still merged into the permission union, and still drawn between the
Layers they name. This is reachable only when two LayerGraphs declare Rules from
exactly the same Layers and the host tie-break awards them all to the earlier
one; none of the four configs in this repository is affected.

What this gives up is the local reading. Inside one lane you could previously see
a LayerGraph's whole shape without your eye leaving it, because every Rule
terminated in that lane. Now a LayerGraph whose dependencies live elsewhere sends
lines out, and reading it means following them. LayerGraph isolation exists to
answer exactly that, by pulling the depended-on Layers into adjacent lanes; it
needs no special case for References any more, because there are none.
