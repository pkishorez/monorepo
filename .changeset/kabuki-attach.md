---
'@kestack/kabuki': patch
---

`toReact` and `Start.app` take `attach`, a list of Attachments: each is called with the running app when it starts in a browser and returns how to stop it, and `AppRuntime` gains `subscribe` so an Attachment hears every change.
