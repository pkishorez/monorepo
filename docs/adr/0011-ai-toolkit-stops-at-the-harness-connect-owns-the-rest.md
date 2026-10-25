# ai-toolkit stops at the harness; Connect owns the Machine and what Code keeps

ai-toolkit had grown into the whole server: the harnesses, and on top of them Projects, Sessions, Settled, Titles, the stored records, the RPC API, the Machine's identity, Heartbeat and tunnel, the Machines Backend and the `ai-toolkit serve` CLI. Only the first is about making Coding Harnesses work, and an App that is not Code, such as a bot, has no Sessions at all. So ai-toolkit now keeps only the harnesses: opening a Conversation in a folder, running, steering and cancelling its Turns with their rules (an untaken steer becomes the next Turn; an Agent-started Turn begins only while no user Turn runs) in one in-memory actor, Forks, Asks, a One-shot Prompt, Skills, models and Settings, Harness Binaries, Messages projected from raw records, and Speech to Text behind a door of its own. It keeps nothing and serves nothing. Everything else moves to `@kestack/connect` (`apps/connect`, the `ke-connect` command): the Machine, Cloud Connect (the Worker and its database, which Code no longer deploys), and one App Group per App, of which the `code` group owns Projects, Sessions, Settled, Titles, the Bootstrap Sweep, storage and its RPC API. Code becomes only a UI on Connect.

## Considered Options

- **Keep Sessions in ai-toolkit, move only the Machine out**: rejected. A Session is Code's idea of a kept Conversation; a toolkit that stores and titles them decides for every App what it keeps.
- **A Connect of its own per App**: rejected. Code, and later Bot and Devtools, are App Groups served on one Machine's one socket.
- **Leave the Turn rules to each App on the bare harness contract**: rejected. They are how a harness behaves, and every App would write them again.

## Consequences

- ai-toolkit loses its `bin` and its `machines` doors; Code imports its client from Connect.
- Cloud Connect moves to `connect.kishore.app` on a fresh database; each Machine registers again on its next start, keeping its id and Machine Key.
- Connect keeps its files in the XDG folders under `kestack/`: production directly there, and each branch in development under `kestack/.branches/<branch>/`, as its own Machines with its own Cloud Connect. Any App's `pnpm dev` ensures its branch's Connect runs, which stops when the last App using it does.
