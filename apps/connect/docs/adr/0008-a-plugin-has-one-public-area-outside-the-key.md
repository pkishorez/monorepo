# A Plugin has one Public Area outside the Connection Key

Status: accepted.

A browser can send the Connection Key only as a WebSocket subprotocol, so an `<img>`, `<video>`, `<iframe>` or a new tab can never carry it, and a file shown that way needs a URL that works without it. So `ke-connect` forwards by Plugin name and still checks the key on everything but one place per Plugin, its Public Area: `/<name>/<sha256>/<rest>` reaches the Plugin as `/<rest>` with the key checked and the Release matched, as `/rpc` always did, and `/<name>/public/<rest>` reaches it as `/public/<rest>` with neither. `ke-connect` never names a Plugin, and the guard still names what stays open rather than what is shut. A Plugin serves routes of its own beside its RPC group through cli-platform's `Plugin.make`, and is alone responsible for what its Public Area answers.

## Considered options

- **Every Plugin checks the key itself, `ke-connect` only forwards.** Rejected: one mistake in any Plugin would open the whole Connection, and the key would reach every Plugin.
- **Each Plugin declares its public paths, and `ke-connect` lets only those in.** Rejected for now: tighter, but a Plugin's paths would have to reach `ke-connect` through its Release or at start, for one Plugin that needs one prefix.
- **Only `/files/ticket/…`, named in `ke-connect`.** Rejected: `ke-connect` stays small and knows no Plugin by name.

## Consequences

- This is the first way into a Connection without its key. Whatever a Plugin puts in its Public Area must check its own credential: the `files` Plugin's is a File Ticket.
- The Public Area carries no Release hash: what it serves must not depend on the App's build.
- The router's change raises the Minimum Connect to the `ke-connect` release this ships in, once that release is published: a deploy refuses a `minConnect` above the version in `package.json`. Until then an older `ke-connect` runs the `files` Plugin but asks for the key on every File Ticket and answers it 401, so a File Embed shows it could not load.
- `ke-connect` tells the Plugin how each request came in, `key` or `public`, in `x-ke-connect-access`, and starts it with `KESTACK_PLUGIN_ACCESS` set to say it does. A request with no header is taken as holding the key only when the CLI does not say so: an older `ke-connect`, which passed on nothing but keyed requests. With it set, such a request reaches nothing.
