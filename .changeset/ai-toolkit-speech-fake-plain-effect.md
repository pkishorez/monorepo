---
'@kestack/ai-toolkit': patch
---

`@kestack/ai-toolkit/speech/fake`: `speech` is a Fake made with `@kestack/kabuki/fake`, no Kabuki Actor. Its state is the wish, the model on disk and what a Take turns into; its control `Hear` sets that; its Layer gives `Speech` as before. Breaking: `speechFakeOver`, `SpeechFake`, `SPEECH_CONTROLS`, `blank`, `kept`, `HEARD_TEXT`, `SPEECH_MODEL_BYTES` and `FAKE_MODEL_BYTES` are gone; `makeFakeSpeech` stays.
