---
'@kestack/connect': patch
---

A Connection shows files to an App through the new `files` Plugin, and a Plugin has a Public Area outside the Connection Key.

**Added**

- The `files` Plugin. `requestFile({ base, path })` answers with a File Ticket: a URL that serves one image, video, audio, PDF, HTML or markdown file to whoever holds it, for an hour, with range requests and an ETag, so a file written again is sent again; HTML and SVG run sandboxed. It refuses with `FileMissing`, `NotAFile`, `UnsupportedFile` or `FileUnreadable`.
- `./files`: `FilesApi`, `FilesClient`, `FilesClients`, `FilesAddress`, the file kinds and extensions, and `embedPath` for a File Embed's `files:` address.
- `publicPath` and `publicOfPath` in `./cloud`, for a Plugin's Public Area.
- `CodeClients.at` and `CodeClients.mismatch`.

**Changed**

- A Connection passes `/<plugin>/<sha256>/<rest>` to the Plugin as `/<rest>`, with the key, and `/<plugin>/public/<rest>` as `/public/<rest>`, without it. Every request it passes on says which, in `x-ke-connect-access`, and it starts each Plugin saying so, so a request without the header reaches nothing.
- The code Plugin tells every Session's agent how to show a file with a File Embed, `![caption](files:<path>)`.
