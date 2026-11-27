---
'@kestack/connect': patch
---

The code Plugin's Engine takes what only the computer has from outside: `Engine.layer` now requires the Store, the harnesses, Git, the File System, Folders and ai-toolkit's Harness Host, and imports nothing of Node's, so it runs in a browser tab. The Store sits over any `aiTable` driver (`storeOver(table)`: SQLite, memory or IndexedDB). `engine/node.ts` gives the real ones on this computer: `storeLayer(path)` on a SQLite file, and `nodeEdges({ home })` for git, the File System, Folders under home and the Harness Host. Breaking inside the Plugin: `EngineOptions` loses `home`, which goes to `nodeEdges`; the Folder Check, Attachments, adding a Project and a Harness Account's config folder go through the File System, so a relative path a user gives is read under home.
