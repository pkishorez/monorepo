---
'@kestack/kabuki': patch
---

`Page.wholeQuery` is a query field that holds a page's whole query as written, every pair of it, repeated and undeclared ones too, for a page whose query is someone else's to say, such as an OAuth authorization's signed request. A move keeps it, the page's Loader is handed it, and the Data cache keeps a copy per query. Written back, the page's other fields are said over it.
