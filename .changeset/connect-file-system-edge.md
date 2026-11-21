---
'@kestack/connect': patch
---

Inside the code Plugin, the computer's File System sits behind one key, `FileSystem`: the home folder, a folder's entries, what a path is, its symlinks resolved, a folder made, a file read, written or removed, failing only with `NotFound`, `AccessDenied`, `AlreadyExists` or `IoError`. `nodeFileSystem` is the one on this computer, and a browser tab can give a fake. Nothing reads it yet.
