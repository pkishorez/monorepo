# Pagination

Results come in pages whether you asked for one or not.

Every query has a page size and returns a flag saying whether rows were left
behind. Resuming needs no cursor and no server state — you hand back the last
entity of the page you just read, and the walk continues from there.

Deleted notes complicate this, and the third Story here shows why they do not:
the limit counts the rows you actually receive.
