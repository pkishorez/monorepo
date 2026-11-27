# DevTools serves MCP on its own server

**Status:** accepted

An AI agent reaches DevTools through one MCP endpoint, `/mcp`, on the
DevTools Server itself: `McpServer.layerHttp` from `effect/ai`, on the same
loopback port as the app and the RPC routes. Each Tool that has something for
an agent registers its own Toolkit on it from its server half: Lotel's
`server/mcp/telemetry/`, Kabuki's `server/mcp/sessions/` in
[@kestack/devtools-kabuki](../../../devtools-kabuki/README.md). Monoverse
registers none. A Toolkit lives under `server/mcp/<topic>/`, a `contract/`
and a `real/` like an RPC group; the `kabuki` preset of
[@kestack/monoverse](../../../monoverse/README.md) opens `mcp/*/contract`
as a door for that server only, as `http/*/contract` is.

A Toolkit is built inside its Tool's server Layer, beside its RPC routes, so
its handlers read the same Services: Lotel's tools the one Telemetry Store,
through a `Traces` Service the RPC now shares; Kabuki's tools the one
registry of live Kabuki Sessions, whose tabs answer them. This is what
[ADR 0013](./0013-the-app-is-one-kabuki-tree-of-composable-tools.md) left
open when it removed the Client Commands of
[ADR 0008](./0008-client-commands-over-mcp.md).

## Considered options

- **A stdio MCP server, run by the agent's host.** A second process would
  have no live Kabuki Sessions: they are sockets held in the DevTools
  Server's memory. It would also be a second owner of the SQLite store,
  which ADR 0008 already turned down.
- **One Toolkit for all of DevTools, in the CLI.** It would reach into every
  Tool's Services, and a Tool could no longer be served alone with its
  agent tools.
- **Client Commands again.** An agent with a shell could use them, but one
  without could not, and Kabuki's calls, such as Sending a Message, read
  better as typed tools than as CLI flags.

## Consequences

- `McpServer` is marked unstable in `effect` 4.0; an `effect` update may
  move it.
- `kabuki_timeline` and `kabuki_fakes` answer with the first value of their
  stream, as a tool answers once.
- The tools answer for a model, not for the Inspector: plain records, a
  payload as one line of TypeScript, the timeline's last 10 entries, and an
  output schema of only `object`. There is no blueprint tool; an opened
  Instance says what it takes. An MCP test holds each Toolkit under a size
  budget.
- An Instance is named by its Actor, its key or its parent, not its
  address, and a Message is listed only when it has a description: a
  Kabuki app describes the Messages a person sends, and DevTools counts the
  rest as internal. Measured with blind agents on the Code app, these, with
  `kabuki_send` answering what changed, cut the calls and tokens a task
  takes; see the PR that brought them.

## Note

Since devtools-kabuki's
[ADR 0002](../../../devtools-kabuki/docs/adr/0002-a-step-shows-what-its-message-did.md),
the Kabuki tools answer in compact text, not plain records, with no output
schema. The timeline gives Chains, newest first, twenty lines a page, with
repeats that changed nothing folded. A ninth tool, `kabuki_step`, prints
one whole Chain with what each Message did. `kabuki_send` and
`kabuki_control` wait until the app is Settled, not a fixed pause. Naming
Instances and listing only described Messages stand.
