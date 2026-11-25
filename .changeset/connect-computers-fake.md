---
'@kestack/connect': patch
---

`@kestack/connect/fake`: the Computers fake, `computers`. A Kabuki Actor of the computers a person has, each a keyed Child owning its own File System fake, served as `Computers` for `./browser`. Its Controls add a computer, which comes up online with its tunnel reachable, take one offline (Down at once) and back, and remove it.

Breaking, in `./browser`: a computer's `edges` are only its own, its File System and git; `inTab` takes the Agent's and Speech's (`AgentEdges`) from its context, shared by every computer's code Plugin. `Computer` gains `silentFor`.
