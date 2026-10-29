# CLI Platform

What every kestack CLI needs on one computer, whatever it does: where it keeps its files, one copy of each download for every CLI, one process per name, and the Plugins it runs. It knows nothing of what a CLI is for.

## Language

**Folders**:
Where a kestack CLI keeps its files. Each named copy of a CLI, such as a Connection, has its own data and state folders; the cache is one for every name and every kestack CLI; the shared folder holds what outlives any one name, such as a working copy a Plugin makes, one for every kestack CLI too; sockets go in a short runtime folder of the user's own, or are named pipes on Windows. A Plugin has folders of its own inside its CLI's, and a shared one of its own name.
_Avoid_: paths, dirs, home

**Downloads**:
The one shared copy of each downloaded file on a computer, in the cache, known by its sha256, or by a key when no hash is known up front. A file is there whole or not at all, and two processes that want it at once download it once. Files not used for a while are pruned; a Plugin running from one marks it used every day.
_Avoid_: binary cache, store, artifacts

**Single**:
One process per name on a computer. The process that holds the name serves its control calls on the name's socket; a second process that starts with the same name finds it running and asks it, rather than running beside it. The name is free again the moment its process ends, however it ends.
_Avoid_: lock, pid file, daemon

**Plugin**:
A separate Node program a CLI runs, one file named by its sha256, downloaded and kept at the version the CLI asks for. It serves one RPC group, and the CLI's control calls, on a socket of its own. The CLI starts it, stops it, swaps it for a new version, and starts it again after a pause when it dies.
_Avoid_: extension, add-on, worker, service

**Plugin State**:
Where a Plugin stands, as its CLI reports it upward: Downloading its file, Starting, Running, or Crashed with its last lines and when it is tried again.
_Avoid_: status (a Plugin's own answer about itself), health

## How the code is laid out

`src/` has three parts: `files/` (Folders and Downloads), `plugins/` and `single/`. `plugins/` has three: `contract/`, what a CLI and its Plugins agree on; `actor-plugin/`, the CLI's side, a Kabuki Actor keeping one Plugin running; and `plugin/`, the Plugin's side. The `Plugins` Capability, through which the Actor reports its Plugin State, is in `contract/`: the Actor Requires it and the CLI Provides it above, so it belongs to neither side's folder, and a fourth folder beside them would crowd the level. Both sides import `contract/`, the one sibling link inside `plugins/`. The Plugin's side is its own subpath, so a Plugin's bundle never pulls in the Actor or Kabuki.
