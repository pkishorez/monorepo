# Pagination

Results arrive in pages. This occurs whether you ask for a page or not.

Each query has a page size. Each result says whether rows remain.

To continue, give back the last entity of the page that you just read. There is
no cursor to keep and no state on the server.

Deleted notes make this look difficult. The third Story shows that they do not.
The limit counts the rows that you receive.
