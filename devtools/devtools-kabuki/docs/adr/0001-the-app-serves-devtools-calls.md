# The app serves DevTools' calls

**Status:** accepted

A running Kabuki app dials the DevTools Server at `/kabuki/connect` and
serves its eight calls (`blueprint`, `watch`, `look`, `travel`, `fork`,
`send`, `fakes`, `control`) over that socket as one Effect RPC group;
DevTools is the RPC client of each socket, and passes the same calls from
its own page and its CLI to the tab at `/kabuki/session/:name`. The tab
computes every answer, since only it has the Actors' code to replay its
History, and decodes every Message and control payload it is sent by its
own Schemas.

## Considered options

- **The app pushes everything to DevTools.** Rejected: DevTools would have to
  keep and replay every Snapshot without the Actors' code, Messages and
  Models would cross the wire whether anyone looks or not, and travelling,
  forking or Sending to the app would still need a way back into the tab.
- **A relay per Vite dev server, as FoldKit does.** Rejected: it ties
  DevTools to one build tool and to development, while a Kabuki Session
  connects from any page, dev or production, and from Node. One DevTools
  Server already runs on a known port.
- **An MCP server in front of the Kabuki Sessions.** Rejected for now: agents
  ask through Client Commands (`devtools kabuki …`), as DevTools'
  [ADR 0008](../../../devtools/docs/adr/0008-client-commands-over-mcp.md)
  decided for telemetry. An MCP server would wrap the same calls.

## Consequences

- `/kabuki/connect` accepts any origin, and records it. Everything that reads
  or moves a tab (`/kabuki/sessions`, `/kabuki/session/:name`) answers only a
  request with no `Origin`, as from the CLI, or with DevTools' own.
- DevTools keeps Kabuki Sessions in memory only; one is gone when its socket
  closes, and comes back when the app redials.
- What only DevTools asks a tab, the name it gave it and the page it is on,
  is a wire call of its own beside the eight, never forwarded.
- The calls are one `KabukiSession` Service: answered in the page straight
  against the app and its FakeWorld, or through DevTools by `remote`, so a
  panel works the same in both.
