# Text fields

Your Shortcuts step aside while someone types, and you choose the few that should still work there.

The worst keyboard bug is a `j` that moves the list while someone types "Jo" into search. Inside a text field, a plain key types, so [typing j and k moves nothing](use-keys/text-fields/typing-in-a-field-moves-nothing). [Escape leaves the field first](use-keys/text-fields/escape-leaves-the-field-first), so a half-written line is never closed away by accident.

Some keys belong in a field, like `mod+Enter` to send. Add `inTextEntry` to a Shortcut with Ctrl, Alt or ⌘, and [only that one fires while typing](use-keys/text-fields/send-from-inside-the-reply-box).

You can also mark any element. A combobox marked `data-keys="enabled"` [hands its arrows and Enter to your Shortcuts](use-keys/text-fields/a-combobox-hands-over-its-arrows). A canvas or editor marked `data-keys="disabled"` [keeps every key for itself](use-keys/text-fields/a-canvas-keeps-its-own-keys).
