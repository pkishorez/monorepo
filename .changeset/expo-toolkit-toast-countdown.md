---
'@kstackz/expo-platform': patch
---

A toast's auto-dismiss countdown now starts when the toast is drawn, not when `toast.show()` is called. On a busy JS thread (seen on an Android emulator, where a delete held the thread for up to five seconds) the old countdown could run out before the toast was ever on screen, so a "Deleted … Undo" toast went unseen. New `ToastStore.shown(id)`, called by the viewport as each toast mounts.
