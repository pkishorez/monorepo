# Speech to Text runs on the Machine, and its progress is a stream

A Machine turns spoken audio into text itself, with sherpa-onnx (`sherpa-onnx-node`) and NVIDIA's Parakeet TDT 0.6b v2 int8 model, behind a `SpeechToText` service that takes 16 kHz mono PCM and gives text. The user switches it on per Machine; the switch is a wish the Machine keeps, so it downloads the model (about 660 MB from its Hugging Face copy, which serves it several times faster than GitHub's release, whose 480 MB tarball is the fallback) into its own data folder, starts the download again after a restart, and deletes the files when switched off. Any device may Dictate through any Machine that has it on. Its procedures are a seventh group, `speech`, merged into `AiApi` as ADR 0004 says: `enableSpeechToText`, `disableSpeechToText`, `watchSpeechToText` and `transcribe`.

`watchSpeechToText` is a stream: the state now, then every change (off, downloading with bytes of total, ready, failed). This is a written exception to ADR 0010: the table stays the only channel for records, and download progress is not a record.

## Considered options

- **The browser's own speech API.** Rejected: it differs by browser, sends audio to the browser vendor in some, and is missing in others.
- **A cloud speech service.** Rejected: it needs an account and a key, and the audio leaves the user's computers, while every Machine is already a computer that can do the work.
- **sherpa-onnx in the browser, as WASM.** Rejected: the good models are hundreds of megabytes per device, and a phone cannot run them well.
- **Streaming recognition with partial text.** Rejected: a Dictation is put in when it stops, and Parakeet turns ten seconds of speech into text in about 0.3 s on an M1 Pro, with punctuation and capitals.
- **Progress as a row in the Machine's table.** Rejected: a row every few percent fills the table with what nobody reads again.

## Consequences

- The browser records raw PCM through an AudioWorklet; sherpa-onnx reads no webm, opus or mp4, and the server needs no ffmpeg.
- `sherpa-onnx-node` is CommonJS without types; one typed wrapper inside the service is the only code that touches it.
- A Machine with Speech to Text off answers `transcribe` with a typed failure; the app picks another Machine that has it on.
