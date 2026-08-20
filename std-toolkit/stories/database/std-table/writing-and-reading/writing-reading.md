# Writing & reading

Putting a note in, taking it back out.

A write returns the stored entity: your value, plus the metadata the table
stamps alongside it — which entity it is, which schema version, when it last
moved, and whether it is still live.

That last flag is why delete is more interesting than it sounds. A delete marks
the note rather than removing it, which is what makes it undoable — and what
makes the one call that really removes a note ask you to type a phrase first.
