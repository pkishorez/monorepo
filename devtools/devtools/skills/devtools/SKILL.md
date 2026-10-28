---
name: devtools
description: Read local OpenTelemetry Traces, and the History and state of running Kabuki apps, from a running DevTools Server through the `devtools` Client Commands. Use after running an instrumented app, script, or test locally to see what actually happened, find the Trace an action produced, explain a failure from recorded spans and logs, or see which Messages a Kabuki app handled and what they changed.
---

# DevTools telemetry

`devtools` is one binary with two roles. On its own it runs the
**DevTools Server**: a loopback web server that ingests OTLP traces and logs
and stores them. Every subcommand is a **Client Command** that reads from
that server. Client Commands never open the store themselves, so a
server must be running first.

Laymos (architecture lint, inspect, stories) is a separate CLI and is not
reachable through `devtools`. Use `laymos` directly for that.

## Workflow

1. Make sure a DevTools Server is running. If `devtools list-traces` reports
   it cannot reach a server, start one in the background:
   `devtools` (or `npx @kestack/devtools`). The app under test must
   export to the same URL, by default `http://127.0.0.1:14400`.
2. Run the action you want to observe: the app, a script, a test.
3. Wait about one second. Exporters batch records and the server writes them
   asynchronously, so the newest Trace can lag the action slightly.
4. `devtools list-traces` to find the Trace the action produced. Rows are
   newest first. Match on service, root span name, and start time.
5. `devtools get-trace <trace-id> --format text` to read what happened as a
   narrative: spans in start order, nested by parent, with their Log Records
   interleaved in time. Use `--format json` (the default) when you need to
   filter with `jq` or inspect attributes.
6. If nothing shows up after a retry, the app is probably not exporting to
   the DevTools URL. Check its telemetry layer's endpoint before looking
   further.

## Commands

Telemetry commands accept `--url <base-url>` and `--format json|text`
(JSON by default). `devtools skills` lists as text by default and accepts
`--format json`.

| Command                                    | Purpose                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `devtools [--port N] [--db PATH] [--open]` | Run the DevTools Server.                                                                                 |
| `devtools list-traces [--limit N]`         | Recent Trace Summaries, newest first. Default 20.                                                        |
| `devtools get-trace <trace-id>`            | One Trace: flat span list with `parentSpanId`, each span's logs, and trace-level logs that name no span. |
| `devtools kabuki …`                        | Ask a running Kabuki app about itself; see [Kabuki apps](#kabuki-apps).                                  |
| `devtools skills`                          | List the skills shipped with the package.                                                                |
| `devtools skills devtools [--install DIR]` | Print this skill, or write it to `DIR/devtools/SKILL.md`.                                                |

Exit status is nonzero and the reason goes to stderr when a Trace or a
Kabuki Session is missing or no server answers.

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
  provisional), `statusMessage`, `attributes`, and `logs[]`.
- `logs[]` for Log Records in the Trace that do not identify a span.

`narrative` is the span's stated intent, written when it started. The outcome
is in `status`, `statusMessage`, and the logs, never in the narrative.

## Kabuki apps

A Kabuki app attached with `connect` from `@kestack/devtools-kabuki/session`
dials the DevTools Server as a **Kabuki Session** under a name, and answers
questions about itself: its History, the Snapshot at any Step, what one
Step changed. DevTools keeps a Kabuki Session only while the app runs.

1. Open the app with `?kabuki-session=<name>` in its URL (say
   `?kabuki-session=checkout-bug`), so you know its name. Or read the name
   from the app's in-page dock.
2. `devtools kabuki sessions --format text` lists the live ones: name, app,
   origin, when connected, page. A taken name gets `-2`, `-3`.
3. Do the action in the app, then
   `devtools kabuki history <name> --last 20 --format text`: one line per
   entry, `#id  Message  → destination  from source  outcome  at Time`.
   `--since <id>` gives only what came after an entry you saw before.
4. `devtools kabuki changes <name> <id> --format text` for what one entry
   did: its Message, the Commands it asked for, each Instance added, changed
   or removed, with Model paths before and after.
5. `devtools kabuki snapshot <name> --path model.items.0 --format text` to
   read part of the app's state. `--at <id>` (or `--at init`) reads it as it
   was right after that entry; absent, as it is now. Large values are folded;
   add `--expand`, or narrow the `--path`.

A wrong name, Step or path fails with what is there instead: the live
names, the entries kept, the keys at the path. Values are the app's encoded
data (Dates as strings, and so on). Entry Times are milliseconds since the
app started, not dates.

## Installing this skill

```sh
devtools skills devtools --install .claude/skills
```

Re-run after upgrading `@kestack/devtools`; the copy is overwritten so it always matches
the installed commands.
