# Routing

Status: works, without a router. Every route, the search kept in the query,
back and forward, a hand-edited address and NotFound all work. What a real
router needs from Effect Oak is under Blockers.

## What was ported

Foldkit's `routing`: Home, People (a search kept in `?q=`, recent searches, a
fake 300 ms lookup), Person by id, Files (every path under `/files` is one
route holding the rest of the path, with breadcrumbs), a very nested route and
NotFound.

The docs app's router owns the page's path, so the demo keeps its own path
after the `#`: `/demos/effect-oak/routing#/people?q=dev`.

```
Routing (root)            requires Location (from the Layer)
  Model { path }          the path the current State came from
  Opening                 before the first path: init cannot read the URL
  Home, Nested
  People                  └─ people: People   (Child)
  Person { personId }
  FilesIndex
  Files { path }
  NotFound { path }
  every State: Lifetime heardUrl(model.path) → ChangedUrl
  ClickedLink → Command: Location.push(path)
  ChangedUrl  → state: routeFrom(path)

People (Child of People)  Model { input, history, results: Loading | Loaded }
  Lifetime: the URL's ?q= → HeardSearch → Command: lookup → FoundPeople
  SubmittedSearch, ClickedLink → Command: Location.push(…)

../location/   Location Service (hash path, push, replace, back and forward),
               heardUrl, pushUrl, Link: shared by the four routing demos
route/         the routes as a Schema, routeFrom(path), paths for links
people/        the People Node, its data, and the Person page drawing
files/         the file tree and its two pages, drawn from State
pages.tsx      the frame (nav and an address bar), Home, Nested, NotFound
```

The URL comes first, as in Foldkit: a click Sends `ClickedLink`, its Command
pushes the path, the Location hears it and the State's Lifetime sends
`ChangedUrl`, which picks the next State. Back, forward and typing in the
address bar take the same road. One navigation is two Messages
(`ClickedLink`, `ChangedUrl`); a search is four (`SubmittedSearch`,
`ChangedUrl` in the root, `HeardSearch` and `FoundPeople` in People).

## Deviations

- **Hash paths**, so the docs router never sees them. A link is a real
  `<a href="#/people">` (middle-click and copying work); a plain click is
  handed to the View, which Sends `ClickedLink`. Foldkit intercepts every
  link on the page as `ClickedLink { request: Internal | External }`; here
  each View says where its links go, and there are no external links.
- **No G H / G P keyboard shortcuts.** They would be one more Stream merged
  into the per-State Lifetime.
- **Recent searches are lost on leaving People.** Foldkit keeps
  `peoplePage` in the root Model for the app's whole life; here People is a
  Child of the People State and is destroyed with it (blocker 10). Coming
  back from a person starts a new People with the current search only.
- `@foldkit/ui` Input and Button became the docs app's own.

## Blockers

- **No routing** (blocker 15, deepened here). What this demo had to build,
  and what a router in Effect Oak would need:
  - **init cannot take the URL.** The root starts in `Opening` and the first
    path arrives as a Message at Time 0; Replay at Time 0 draws nothing.
    Reading `window.location` in init would not be honest: Replay runs init
    again, with whatever the address is by then. `Runtime.start(node, { url })`
    with `init({ url })`, the URL kept with the Log so Replay gets the same
    one, is the fix.
  - **The same Lifetime in every State.** A Lifetime belongs to one State, so
    all eight States start the same URL listener on entry (blocker 10). Each
    must also be told the path it was entered with, or it would hear the
    current path again on entry and send a duplicate `ChangedUrl`.
  - **URL changes and link clicks are not Runtime Messages.** Each app writes
    a Location Service, a Lifetime and a link component. A
    `routing: { onUrlChange, onUrlRequest }` option on `toReact`, sending
    Messages to the root, and `pushUrl`/`replaceUrl`/`back` Commands from the
    library, would replace all three.
  - **Time Travel does not move the address bar.** Stepping back draws old
    pages while the browser shows the live URL. The demo draws its own address
    bar from `model.path`, which does replay. A router would need the URL to
    be a projection of the shown tree: `toReact(…, { url: (root) => path })`,
    written with `replaceState` while in Replay and put back on Live, and
    back and forward ignored while in Replay (today they change the live app
    behind the Replay).
  - **Children cannot be given the route** (blockers 3 and 13): People
    listens to the URL itself to get its search, as query-sync's controls do.
  - **The host's router owns history.** TanStack Router numbers its history
    entries and patches `pushState`; the Location writes the next number into
    each entry so back and forward keep working. An adapter to the host's
    router (read and write through it, not around it) is what an app inside a
    routed React app would want.

## Testing

Foldkit's stories check that each URL parses to its route (`/people?searchText=foo`,
`/people/3`, `/files/a/b`, an unknown path to NotFound), that the shortcuts
ask for `NavigateInternal` with the right URL, and that a same-page URL
change syncs the search input, records history and asks for `FetchPeople`.
Scenes draw each route from a Model and check headings, breadcrumbs and the
not-found panels; People has its own story and scene.

What Effect Oak would need:

- `route/` is plain functions and can be tested today: `routeFrom`, `paths`
  and `searchOn`, including that every `paths.*` parses back to its route.
- Named Commands (blocker 4) to see `ClickedLink` ask for a push of a given
  path, and `HeardSearch` for a lookup.
- A typed `Node.step` (blocker 5) to run `ChangedUrl` from a State, and to
  draw a route's View from a State for the scenes.
- Emitting a Lifetime's Message by hand (blocker 6) for `ChangedUrl` and
  `HeardSearch`; today a stub Location Layer under `Runtime.start` can script
  paths, which is an integration test.
