---
name: devtools
description: Read local OpenTelemetry Traces and Flows from a running DevTools Server through the `kstack` Client Commands. Use after running an instrumented app, script, or test locally to see what actually happened, find the Trace or Flow an action produced, or explain a failure from recorded spans and logs.
---

# DevTools telemetry

`kstack` is one binary with two roles. `kstack devtools` runs the
**DevTools Server**: a loopback web server that ingests OTLP traces and logs
and stores them. Every other subcommand is a **Client Command** that reads
from that server. Client Commands never open the store themselves, so a
server must be running first.

Laymos (architecture lint, inspect, stories) is a separate CLI and is not
reachable through `kstack`. Use `laymos` directly for that.

## Workflow

1. Make sure a DevTools Server is running. If `kstack list-traces` reports
   it cannot reach a server, start one in the background:
   `kstack devtools` (or `npx kstack devtools`). The app under test must
   export to the same URL, by default `http://127.0.0.1:14400`.
2. Run the action you want to observe: the app, a script, a test.
3. Wait about one second. Exporters batch records and the server writes them
   asynchronously, so the newest Trace can lag the action slightly.
4. `kstack list-traces` to find the Trace the action produced. Rows are
   newest first. Match on service, root span name, and start time.
5. `kstack get-trace <trace-id> --format text` to read what happened as a
   narrative: spans in start order, nested by parent, with their Log Records
   interleaved in time. Use `--format json` (the default) when you need to
   filter with `jq` or inspect attributes.
6. If a span carries a `flowId`, the work crosses Participants. Pivot with
   `kstack get-flow <flow-id> --format text` to see the swim-lane view as a
   chronological list of Activities, Messages, and Activations.
7. If nothing shows up after a retry, the app is probably not exporting to
   the DevTools URL. Check its telemetry layer's endpoint before looking
   further.

## Commands

Telemetry commands accept `--url <base-url>` and `--format json|text`
(JSON by default). `kstack skills` lists as text by default and accepts
`--format json`.

| Command                                           | Purpose                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `kstack devtools [--port N] [--db PATH] [--open]` | Run the DevTools Server.                                                                                 |
| `kstack list-traces [--limit N]`                  | Recent Trace Summaries, newest first. Default 20.                                                        |
| `kstack get-trace <trace-id>`                     | One Trace: flat span list with `parentSpanId`, each span's logs, and trace-level logs that name no span. |
| `kstack list-flows [--limit N]`                   | Recent Flows, newest first. Default 20.                                                                  |
| `kstack get-flow <flow-id>`                       | One Recorded Flow: `items` in time order, `activations`, `warnings`.                                     |
| `kstack skills`                                   | List the skills shipped with kstack.                                                                     |
| `kstack skills devtools [--install DIR]`          | Print this skill, or write it to `DIR/devtools/SKILL.md`.                                                |

Exit status is nonzero and the reason goes to stderr when a Trace or Flow is
missing or no server answers.

## Finding the server

The URL is resolved in this order:

1. `--url`
2. `DEVTOOLS_URL`
3. `DEVTOOLS_PORT` on `127.0.0.1`
4. `http://127.0.0.1:14400`

The server reads `DEVTOOLS_PORT` too, so setting it once keeps both sides
aligned.

## Reading the JSON

`get-trace` returns:

- `traceId`, `name` (root span), `serviceName`, `startTime`, `endTime`,
  `durationMs`, `spanCount`, `errorCount`, `running`.
- `spans[]` sorted by start time. Each has `spanId`, `parentSpanId` (null for
  a root), `name`, `narrative`, `serviceName`, `startTime`, `endTime`,
  `durationMs`, `status` (`ok`, `error`, `unset`, or `running` while
  provisional), `statusMessage`, `flowId`, `participantName`, `attributes`,
  and `logs[]`.
- `logs[]` for Log Records in the Trace that do not identify a span.

`narrative` is the span's stated intent, written when it started. The outcome
is in `status`, `statusMessage`, and the logs, never in the narrative.

`get-flow` returns the Recorded Flow unchanged: `id`, `parentFlowId`,
`latestTimestamp` (epoch ms), `items[]` (kinds `activity`, `message`,
`local-event`, `activation-start`, `activation-end`), `activations[]`, and
`warnings[]`.

## Installing this skill

```sh
kstack skills devtools --install .claude/skills
```

Re-run after upgrading kstack; the copy is overwritten so it always matches
the installed commands.
