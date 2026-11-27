# The app is one Kabuki tree of composable Tools

**Status:** accepted

DevTools' browser side is one client-rendered Kabuki app, and each Tool —
Lotel, Monoverse, Kabuki — is one plain Actor that starts from its Input and
draws everything below it, with no header and no knowledge of URLs. The root
draws the header and composes the three; a Tool page per Tool turns the
address into Input and the Tool's Emits back into the address. Each Tool's
folder holds its whole slice — RPC contract, Server half, Actors — and its
RPC lives at its own path (`/rpc/lotel`, `/rpc/monoverse`), so a Tool can be
mounted alone, or beside the others in another app, given a Layer for its
Capabilities. The `devtools` binary only serves; the Client Commands and their
shipped skill are gone, superseding
[ADR 0008](./0008-client-commands-over-mcp.md), until agent access is
rethought.

Monoverse no longer hosts Laymos ([ADR 0004](./0004-monoverse-hosts-laymos-over-its-canvas.md),
[ADR 0007](./0007-laymos-is-reached-through-monoverse.md)) nor reads git
through it ([ADR 0005](./0005-git-changes-are-a-devtools-service-backed-by-laymos.md)):
it shows a Project as its Folder tree, checks the one Folder rule with no
configuration, and reads only `sourceRoots` from a `laymos.config.json`, so
DevTools has no dependency on the laymos package while Laymos is sunset.

## Considered options

- **Kabuki Start** bundles a routed Kabuki app, but serves only from
  Cloudflare Workers and draws pages on the server; the DevTools Server is a
  Node process on loopback. The app is a plain Vite build of
  `View.app(Router.view(…))` with the `browser()` adapter, served as files.
- **Tools as Pages**: a Page carries its path, so the Tool could not be
  mounted anywhere else. The Tool page is the thin seam that keeps the Tool
  Actor URL-free.
- **One merged RPC group at `/rpc`**: simpler wiring, but every Tool would
  depend on one contract and none could be served alone.
