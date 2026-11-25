---
'@kestack/ai-toolkit': patch
---

Claude Code answers One-shot Prompts, and Speech to Text hears each word with its times.

**Added**

- `claudeOneShot`, from `harness`: a Layer of `OneShotPrompt` answered by Claude Code on `claude-haiku-5-5`, in one turn, with no tools, no MCP servers, no settings read from disk and a short system prompt, in a temp folder removed after, keeping no session. It runs as the caller's `HarnessAccount` when one is given, and fails after 30 seconds.
- `claudeOneShotWith({ model, timeout })`: the same on another Language Model, the account's default when `model` is left out, failing after `timeout` instead.
- `Recognizer.hear(samples)`: the text, as `transcribe` gives it, and each Heard Word with its `start` and `end` in seconds from the start of the samples, grouped from Parakeet's tokens. Punctuation joins the word before it, in its text but not its times. `transcribe` is as it was.
- `SAMPLE_RATE` and `SpeechToTextError` are exported from `speech`, so a program can install and load a Recognizer through `SpeechToText` itself.
