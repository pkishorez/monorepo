# Metadata

Each page's title, description, canonical URL and share card come from its Route and its data.

Link previews and search results read the head of the HTML, and a tab's title should follow the page. You give a place `metadata`, a value or a function of its params and Input; the deepest place wins, field by field.

[A post's title, description and share card come from the post itself](kabuki-start/metadata/a-post-is-described-by-its-own-data), in the HTML the server sends. After the first page the browser writes them: [the tab title and canonical URL follow every move](kabuki-start/metadata/the-title-and-canonical-follow-every-move).
