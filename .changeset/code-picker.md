---
'code': patch
---

The skills palette and the model picker are now one Picker (`ui/picker`): a stack of Steps on cmdk, run by one actor on the isolated `picker` Surface, drawn as a centred list when opened by keys and as a popover by its button when opened by pointer. Enter picks a row, which finishes or opens the next Step; Mod+Enter finishes on the row highlighted; Ctrl+H or Backspace in an empty search goes back a Step; Escape clears the search, then closes; arrows and Ctrl+N/Ctrl+P move; a trail shows the choices so far. The model Picker goes agent, model, then each setting, opens at the model once a session has started, and its settings button opens it at the first setting; `Ctrl+M` opens it, even while typing, in place of `Mod+Shift+M`. `Ctrl+[` and `Ctrl+]` now work with Vim Mode off too.

Focus belongs to the keyboard: the composer's editor is the page's default Focus Spot, so closing a Picker, picking a skill, a model or a setting, or moving to another session puts focus back in it, and no popup moves focus as it closes. The project page reads the agents, models and Skills once and shares them with its pages, so moving between sessions reads nothing again. Rows the device holds draw at once; with none, a skeleton shows until the server has answered, and only then is an empty list or a missing row believed. `useTrusted` and its timer are gone.
