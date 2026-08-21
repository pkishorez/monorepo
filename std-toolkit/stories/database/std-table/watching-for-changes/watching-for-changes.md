# Watching for changes

Every write already returns the entity it stored. `subscribe` is for
everyone else — code that did not make the write but still needs to know it
happened.

A note's own entity surface gives you a Stream of Change Notices for that
note, narrowable to just the notes whose fields match a filter. The table
itself gives you a wider, untyped Stream across every entity it holds.

Nobody has to be listening. A write that nobody subscribed to still lands.
