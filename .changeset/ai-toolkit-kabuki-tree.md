---
'@kestack/ai-toolkit': patch
---

The engine's actors are laid out as one folder per actor, `actor-projects/actor-project/actor-session`, with the Session running its Turn, its Background Jobs and the agent's own Turns as Workers instead of child actors, and answering a Fork, a new Title and an Ask at its Desk. The root loads the Store itself, and Folders sits behind the Engine. The source is four folders: `api`, `cli`, `kabuki` (the engine and machine trees) and `services` (harness and records). `docs/kabuki-tree.md` records the trees. Nothing changes in the API; the `machines` exports keep their names.
