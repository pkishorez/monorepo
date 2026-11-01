---
'code': patch
---

A Dictation belongs to the field it was started from, its Owner: a Session's Draft, a new session's, or a question's own answer. Its text goes back there wherever it is stopped, and waits for that field to be drawn again; the "last Draft on screen wins" routing and the dictation list, with its Paste and Discard, are gone. Every other field sees only that one is recording elsewhere, and its mic waits. The header's mic is now a cancel, shown only while a Dictation is going.

A question's own answer can be dictated: a mic beside its row or field, Space on its row, or Ctrl+Space anywhere in the step. Enter on an own answer with text takes it and goes on; `i` still edits it. A secret's answer has no mic.

On touch, the collapsed Draft keeps its caret or selection when collapsed, and a tap anywhere on its line opens it as it was. A `/` typed in the Draft opens the skills Sheet with its search focused, so what is typed next searches it.
