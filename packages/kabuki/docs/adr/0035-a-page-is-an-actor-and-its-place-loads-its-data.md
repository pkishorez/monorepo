# A page is an Actor, and its Place loads its data

Partly superseded by [ADR 0037](0037-a-page-is-defined-apart-from-its-build-and-the-router-holds-its-data.md): there is no Place, the Router holds every page's data and hands it down as `status`, and a move takes only a Route value. A page as an Actor with a place in the URL, its `status` Prop, the held move and the Data cache stand.

Supersedes the page parts of [ADR 0030](0030-a-server-draws-pages-started-from-their-loaders.md) and amends [ADR 0013](0013-a-child-owns-its-data-after-input.md) for pages. A page was a Route in a tree written apart from it, served by an Actor that started from its Loader's answer as its Input, through an outlet its parent wrote by hand; while it had no Input it did not exist, and its slot showed a pending or failed screen the Router chose. Now a page is written as an Actor with a place in the URL, `Route.page({ path, params, data, pages, … }).build(…)`, and the Routes are read down from the root page, `Route.tree(() => App)`. Kabuki writes one more Actor around each page, its Place, which holds its data and loads it, and hands it to the page as one Prop, `status`: `Loading`, `Failed` or `Ready { data, refreshing }`. A page takes no Input: it exists before its data, draws all three states itself, and keeps its own Model through a reload.

The Router holds only where the app is. A move to pages whose data is not on screen is held up to 150ms while it loads; past that it lands and each new Place loads its own, side by side, so a quick page never waits on a slow one. The last data of each place is kept in the Data cache, one copy per name and params, in front of the browser's `Loading`, outside the Snapshot: data enters the app only in the Messages that bring it, so replay never fetches. Back, a link to a page seen before, and a preload all read it.

## Considered Options

- **Outlets, as before**: rejected. Every parent wired its pages by hand, and the Routes were a second tree beside the pages that could disagree with them.
- **`Routes.X.page({ view, loading })` with a flat map of pages and an `<Outlet />`**: rejected. New words, and a second way to compose beside Children.
- **The user extends a Route Actor with `Loading`, `Ready` and `Failed` States**: rejected. It takes the page's own State, and its type needs a registry.
- **Loading and failed screens as options of a View, or React Suspense with an error boundary**: rejected. Loading is not a View's, and Suspense needs a thrown promise, where Kabuki's waiting is a fact in a Snapshot.
- **The page's data as its Input**: rejected. Input is read once, and the page exists before its data.
- **The Router holds all loading state, and a parent draws its child's loading screen**: rejected. One `next` Prop per level, and the child could not exist while it loaded.
- **The Data cache per history entry, in the Router's Model**: rejected. One URL could hold several stale copies, a plain link could not reuse one, and every Snapshot would carry all of it.
- **The Data cache read when a Place is made**: rejected. A Child's Input read from outside the Snapshot would make replay start it differently.
- **Preload outside the History**: rejected. A preload is one Message to the Router, so the Timeline shows it; its Command warms the cache, and nothing comes back.
- **A Route value in every Update that moves the app**: rejected as the only form. The Routes' type is worked out from the pages, so a page whose Update returns `Router.push(Routes.X())` is typed from itself. A move also takes a function that makes the Route, whose return is typed loosely and whose body is still checked.

## Consequences

- Twice the Actors in the tree: devtools should fold each Place into its page.
- A page sees its own params typed and its ancestors' loosely: a page is typed before the pages above it.
- A page with pages is a place on its own when the URL ends at it: there are no index pages.
- Pages exist whatever their parent's State: a guard is what the parent draws, not where its pages sit.
- A server draws a `client` page loading, never empty, and a page whose Loader broke or found nothing failed, with a `500` or a `404`; the pages above it are drawn.
- The Loader RPC answers each place on its own line as its Loader is done.
