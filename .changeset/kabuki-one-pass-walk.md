---
'@kestack/kabuki': patch
---

A Message to an Instance with many siblings, or deep in the tree, costs far less. Finding an Instance by its Address walks down once, looking each Child of an `each` up by its key instead of scanning the list, and the Runtime's live tree passes over every Child that did not change. One Message to one of 10,000 siblings went from about 2.9 ms to under 0.1 ms, and one to the bottom of a chain 200 deep from 3.4 ms to 0.25 ms. Nothing else changes.
