---
'@kestack/connect': patch
---

Inside the code Plugin, Folders run over the File System: listing and making folders under home is the Engine's own code, which `Engine.layer` runs itself, so it works the same on a computer's disk and in a browser tab's fake. Breaking inside the Plugin: `EngineEdges` loses `Folders`, `FoldersOptions` and `nodeFolders` go, and `nodeFileSystem({ home })` is a function whose home is the folder Folders never leave and the one `~` names (`nodeEdges({ home })` passes it).
