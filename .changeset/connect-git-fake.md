---
'@kestack/connect': patch
---

The code Plugin's Git has a fake, for a browser tab: `fakeGit`, from `engine/services/git/fake/`, is the `Git` key over the `FileSystem` key, reading and writing `.git` as the File System fake lays it out, and answering as git would: branches and what each tracks, Origin's branches, switches, new Worktrees made as git makes them (their files copied from the main Worktree), renames, a fetch from Origin that drops what Origin no longer has. No package door exports it yet.
