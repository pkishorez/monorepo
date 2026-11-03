---
'@kestack/web-platform': patch
---

`document({ prompts })` chooses what the PWA asks of the reader.

**Added**

- `prompts.update: 'reload'` reloads every open page into a new version as soon as it is ready, in place of the Update Prompt. `'prompt'`, the default, asks first, as before.
- `prompts.install: 'off'` never offers install. `'prompt'`, the default, offers it once, as before.
- `Pwa` takes the same `prompts`, and `PwaPrompts` is their type.
