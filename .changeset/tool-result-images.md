---
'@kestack/ai-toolkit': patch
'@kestack/connect': patch
'code': patch
---

Images a tool gives back, such as a file the agent reads, come through whole, not as `[image]`.

- ai-toolkit: a `toolResult` Part carries them as `images`, each its media type and base64 data, never cut; its `output` is the text alone.
- Code: they show as thumbnails under what the tool gave back, each opened whole over the page by a tap.
