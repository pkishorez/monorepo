---
'@kestack/ai-toolkit': patch
---

Speech to Text on the Machine (ADR 0017): a seventh API group, `speech`, with `enableSpeechToText`, `disableSpeechToText`, `watchSpeechToText` (how it stands now, then each change: `Off`, `Downloading` with bytes of total, `Ready`, `Failed`) and `transcribe`, which takes one clip of 16 kHz mono 16-bit little-endian PCM and answers its text, or fails `SpeechToTextNotReady`. Switched on, the Machine keeps the wish in `speech-to-text/` beside its database and downloads sherpa-onnx's Parakeet TDT 0.6b v2 int8 there, again after a restart until it is whole; switched off, it deletes it. The model loads on the first `transcribe` and stays loaded. `sherpa-onnx-node` is a new dependency.
