# Agents read telemetry through Client Commands, not MCP

**Status:** accepted

Coding agents reach Lotel telemetry through subcommands of the same `devtools`
binary that runs the server. A Client Command connects to a running DevTools
Server over the existing Effect RPC contract and prints JSON or text. A shipped
skill, printed or installed by `devtools skills devtools`, teaches agents the
workflow. DevTools does not expose an MCP server, and Client Commands never open the Telemetry Store
directly.

The primary consumer is a coding agent with a shell: it runs the instrumented
application itself, then asks what happened. Such an agent already composes
CLIs with `jq`, files, and other commands, and a skill can describe a
multi-step workflow in a way tool descriptions cannot. Client Commands cover
Traces and Flows only; Laymos keeps its own CLI because it works on source
files and needs no server.

## Considered options

- **An MCP server inside DevTools.** Rejected for now: it adds a second
  server lifecycle and per-host configuration, and MCP-only hosts cannot run
  the application that produces the telemetry. It stays cheap to add later
  because it would wrap the same RPC client.
- **Reading the SQLite store from the CLI.** Rejected: the running server is
  the store's single owner, and a second writer-capable process invites lock
  and migration surprises.
- **A separate `lotel` CLI package.** Rejected: lotel supplies contracts and
  handler layers but owns no server or CLI (lotel ADR 0001).
- **Attribute search.** Deferred. Recent-Trace listing covers "what did my
  last action produce" without a query language.

## Consequences

- A Client Command fails fast with a clear message when no server answers.
- Client Commands resolve the server URL from `--url`, `DEVTOOLS_URL`, then
  the same `DEVTOOLS_PORT` the server reads.
- Trace JSON drops the storage envelope and flattens spans with
  `parentSpanId`; Recorded Flow JSON passes through unchanged because it is
  already a domain read model.
- The skill markdown lives in the package so it versions with the commands.
