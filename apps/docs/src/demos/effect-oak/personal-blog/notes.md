# Personal blog

Status: works. About, the post list, each post and NotFound, with posts
written in a markdown subset and a live counter inside one post whose count
survives leaving and coming back.

## What was ported

Foldkit's `personal-blog`: a small blog whose posts are markdown, with
"islands" (a live Counter, a Note callout) placed in the text by directives.

```
PersonalBlog (root)    requires Location; one State
  Model { path }       the page is worked out from the path in the View
  Lifetime: heardUrl(null) → ChangedUrl
  ClickedLink → Command: Location.push(path)
  └─ counter: Counter  (Child for the blog's whole life)
Counter                Model { count }; ClickedIncrement, ClickedDecrement
prose/   a tiny formatter: parse.ts reads text into blocks, prose.tsx draws
         them, with islands drawn by the caller
posts/   About and the two posts, as text in the code
```

## Pages as Model data, not States

The routing demos make each page a State. That does not work here: the
Counter must keep its count when you leave the post and come back, and a
Child lives only as long as its parent's State (blocker 10). If Post were a
State, the Counter would be destroyed on every navigation. So the blog has
one State, the Counter is its Child for good, and the View picks the page
from `model.path`. That is Foldkit's shape: `route` and `counter` side by
side in one Model.

The cost: nothing about a page can own work. If the Posts page fetched its
list, that fetch would have to be the root's.

Every `::Counter` in any post draws the same Counter Child, as in Foldkit
(one `counter` in the Model, drawn by each island). The prose drawing gets
`islands: { Counter: () => <CounterView node={children.counter} /> }`, so
the island is a real Child View inside the text.

## Deviations

- **No `@foldkit/markdown`.** A small formatter reads headings,
  paragraphs, lists, fenced code, quotes, rules, inline code, bold, emphasis
  and links, plus `::Name{key="value"}` islands and `:::Name` containers.
  Tables are not supported, so the film post's table was dropped. Foldkit
  parses at build time against a Schema and fails the build on unsupported
  syntax; here the text is read when drawn, and unknown syntax is a
  paragraph.
- Posts are text in a `.ts` file, not `.md` files.
- No `islandAttributes` Schema: attributes are plain strings.
- Hash paths and `Link`, as in [routing](../routing/notes.md).

## Blockers

- **Lifetimes and Children belong to exactly one State** (blocker 10): the
  reason pages are Model data here. A Child kept across a set of States
  (`children: { '*': { counter: Counter } }`) would let pages be States again.
- **No routing** (blocker 15).

## Testing

Foldkit's story checks that `/`, `/posts` and `/posts/<slug>` parse to their
routes, an unknown path is NotFound, a Counter Message reaches the counter
without Commands, and the count survives navigating away and back. The scene
draws a post and checks the island is there.

What Effect Oak would need:

- `pageFrom` and `parse` are plain functions and testable today.
- A typed `Actor.step` (blocker 5) for the blog's and the Counter's rules.
  "The count survives navigating" is a fact about the tree (the Counter Child
  is not recreated), so it needs either a step that reports Children, or
  `Runtime.start` with a stub Location sending paths.
- Drawing a View from a given Model, with a Child in a given Model
  (blocker 5), for the scene.
