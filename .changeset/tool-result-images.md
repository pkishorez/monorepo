---
'@kestack/ai-toolkit': patch
'@kestack/connect': patch
---

Images a tool returns, such as a file the agent reads, now come through whole instead of as `[image]`. A `toolResult` Part carries them in `images` (media type and base64 data), and its `output` is just the text.
