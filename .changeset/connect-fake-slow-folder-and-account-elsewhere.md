---
'@kestack/connect': patch
---

Two more Controls for fake mode. The File System fake's `MakeSlowToList`: listing the folder takes 30 seconds, longer than the Project Picker waits (`MakeReadable` makes it quick again). A computer of the Computers fake (`@kestack/connect/fake`) takes `RemoveAgentAccountElsewhere`: another device removes an agent account the user added, by its name.
