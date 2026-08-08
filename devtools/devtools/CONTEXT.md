# DevTools — Context

Glossary for the DevTools umbrella. Definitions only — no implementation
details, no specs. When a term here conflicts with how the code or the team
talks, fix it here.

## Terms

### DevTools (umbrella)

The single backend process and the single frontend route that host all local
development tooling for this repo. Backend: one HTTP server that aggregates the
endpoints of every tool. Frontend: the `/devtools` route, the one place a
developer opens to use any tool. A consumer only ever needs the **DevTools
URL**.

### Tool

A self-contained capability surfaced under DevTools. Today: **Telemetry**
(powered by lotel) and **Architecture** (powered by Laymos). Each tool keeps
its core logic in its own package; DevTools mounts that logic and exposes it.
The frontend is **tool-first**: a
developer picks a Tool first, and each Tool owns its own inner navigation and
data-fetching idiom.

### Scope (of a Tool)

Whether a Tool's data is **global** or **per-project**. **Telemetry** is global
— one store, no project to pick. **Architecture** is per-project — every
analysis request names its Project folder. Scope is a property of the Tool;
the route does not assume everything is project-keyed.

### Laymos

The Architecture Tool's core logic package. It owns the Config and
Architecture Analysis contracts and calculates analysis from a Project's
source files. DevTools owns path expansion, RPC errors, and transport.

### DevTools URL

The single base URL the frontend talks to. Backs every tool's UI. External apps
also send their OpenTelemetry data here (see Ingestion).

### lotel

The Telemetry tool's **core logic** package: the HTTP API _contract_
(`LotelGroup`), request handlers, ingestion/query orchestration, and sqlite
storage. lotel no longer runs a standalone server or CLI — DevTools is the
process that serves it. Remains a separate, independently-testable package.

### Ingestion

External apps push OpenTelemetry traces/logs/metrics into DevTools using
standard OTLP/HTTP exporters (`POST /v1/{traces,logs,metrics}`). Because OTLP is
a fixed wire protocol, ingestion is **HTTP**, not RPC — it is the one surface
RPC cannot absorb.

### Two surfaces (of the DevTools server)

One process, two HTTP surfaces:

- **`/rpc`** — the frontend surface (Effect RPC). The `/devtools` route consumes
  only this. Carries telemetry reads and per-project Architecture Analysis.
- **`/v1/*`** — OTLP ingestion (HTTP), for external apps. lotel's existing
  ingest group, mounted as-is.

## Decisions

- DevTools is an **umbrella backend host**, not a re-export facade. It owns the
  one listening process; tool packages provide mountable logic, not servers.
- The **frontend transport stays RPC**. The existing `./rpc` (`DevtoolsRpc`)
  export includes telemetry reads and `AnalyzeLaymosProject`; the route never
  imports tool implementation packages. Ingestion stays HTTP/OTLP on the same
  server.
- `AnalyzeLaymosProject` accepts an absolute or `~/` Project folder on every
  request and returns Laymos `ArchitectureAnalysis` directly. It does not echo
  the Project or Config path and does not cache results.
- Laymos is a normal DevTools runtime dependency. Effect Schema is the wire
  contract, including canonical Map and Set serialization.
- lotel is cut **shallow**: DevTools mounts lotel's ingest group for `/v1/*` and
  calls lotel's orchestration + storage for the RPC read procedures. lotel keeps
  its api group + handlers + orchestration + storage, only shedding its
  standalone process.
- DevTools is **published** and must not carry lotel/std-toolkit as runtime
  deps. They are **bundled at build** (`vp pack` `alwaysBundle`, kept in
  devDependencies), so the published artifact is
  self-contained. Storage uses Node's built-in `node:sqlite`, so there is no
  native dependency to ship.
- Frontend is **tool-first**, shares **one devtools RPC client + one
  ManagedRuntime + one DevTools URL**, but each Tool keeps its own fetch idiom
  (Telemetry → TanStack DB collections over RPC).
