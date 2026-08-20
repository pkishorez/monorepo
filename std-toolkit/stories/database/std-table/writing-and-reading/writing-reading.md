# Writing & reading

Put a note in. Take the note out.

A write returns the stored entity. That is your value plus the data that the
table adds: which entity it is, which schema version it uses, when it last
changed, and whether it is live.

The last item makes delete more interesting than it sounds. A delete marks the
note. It does not remove the note. That is why a delete can be undone.

One operation does remove a note. It asks you to type a phrase first.
