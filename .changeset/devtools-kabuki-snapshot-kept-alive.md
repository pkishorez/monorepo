---
'@kestack/devtools': patch
---

The Kabuki devtools read an app whose Runtime is a Snapshot kept alive: the History comes from the App, a Step's changes and an Instance's Trail are worked out from the Snapshots before and after each entry, and there is no Restore entry. The first Step is the History's start, named `start`: `devtools kabuki --at start` replaces `--at init`.
