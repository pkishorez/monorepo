# The Plugin list comes only from Connect Cloud

Status: accepted.

A Connection runs the Plugins Connect Cloud names in its answer to a Report (ADR 0006). It also kept the last answer in `wanted.json`, and started its Plugins from that file when Connect Cloud could not be reached. The product runs only online, and the file was another thing to keep in step. So there is no file. A Connection's list starts empty, and is read from Connect Cloud: the Tunnel Reports as soon as the port is open, however far the tunnel has come, and keeps Reporting until Connect Cloud answers.

The answer is the whole list. A Report that succeeds says which Plugins run and at which Release, so the Plugins running are the Plugins it names. A Report that fails answers nothing, and changes nothing.

## Considered options

- **Keep `wanted.json`, and start Plugins from it while Connect Cloud is down.** The design this replaces. Rejected for the reasons above.
- **Lay each answer over the list so far, so a Plugin no longer named keeps running.** The design this replaces. Rejected: nothing could retire a Plugin, and it guarded against a successful answer being wrong, which a Connection cannot judge. The errors a Report can have are already handled as errors.
- **Ignore an empty list.** Rejected: the list is what Connect Cloud says, whatever it holds.

## Consequences

- If Connect Cloud is down at start, Plugins wait, however the tunnel stands. Until it answers, the Connection's server answers a Plugin's path with 404.
- Sign-in can still use the kept `auth.json` and the kept Sign-in when Connect Cloud is down at start, so the Connection starts and keeps Reporting.
- An outage once Connect Cloud has answered changes nothing: Plugins keep running at the Release it last named.
- A Plugin no longer named stops within a Heartbeat, cutting off its running Turns, which Resume if it is named again.
- A deploy that names no Plugin stops every Plugin on every Connection, so what a deploy names must be right.
- A `wanted.json` left by an older `ke-connect` is ignored, and goes with its folders on `ke-connect remove`.
