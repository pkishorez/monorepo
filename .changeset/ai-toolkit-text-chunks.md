---
'@kestack/ai-toolkit': patch
---

Text and reasoning stream a few sentences at a time. Each chunk (about 250 characters, cut at a sentence end, or whatever waited 1.5 seconds) is its own Raw record and projects to a `textChunk` part; the agent's whole record is still stored with every field, its streamed strings replaced by `{ $stream: id }` pointers, and `restore` puts them back exactly. Tools stay whole records. The client Replica is named after `PROJECTION_VERSION`, and `retired` lists the older ones for `Store.idb({ retired })` to delete.
