---
'code': patch
---

A new Session's page picks the branch it works on, and shows its Starting.

- The Branch Picker sits beside the model in the Status Line, with the New Worktree toggle: one list in two sections, Local and Origin, a local branch that tracks one on Origin saying so, and that one not listed again. It starts on the branch the Project's folder is on, opens by `shift+b`, a click or a tap, and neither shows for a Project that is not a git repository. The pick is kept in the new session's Saved Draft.
- Sent, the page shows each step of starting the Session, such as switching the branch, making the Worktree and starting the agent, where the transcript will be. Started, it stays until the Session's page can be drawn whole, so nothing blank comes between them; a refused start, a failed git step included, leaves the Draft, its text and picks as they were, and says why.
