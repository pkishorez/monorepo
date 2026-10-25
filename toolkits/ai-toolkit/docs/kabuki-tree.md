# ai-toolkit actor tree

ai-toolkit gives Coding Harnesses as plain Effects and has no Actor in its
doors. One Kabuki tree is left, private behind `@kestack/ai-toolkit/speech`:
it keeps the Speech to Text model on this computer. It downloads the model,
deletes it, and turns audio into text with it. `speech.ts` is its front door
and starts the root with `Runtime.start`; the speech Layer gives
`SpeechHost`.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/speech/
  speech.ts                  the front door: enable, disable, watch, transcribe; builds SpeechHost
  capabilities/              SpeechHost
  actor-speech-model/        root; States: Loading | Off | Downloading | Ready | Failed
```

Around the tree, `src/speech/contract/` is the SpeechToText contract,
`src/speech/sherpa/` is sherpa-onnx with Parakeet, and `src/speech/fake/` is
the fake for tests. The caller gives one of them as `SpeechToText`.

## How it connects

Down, from the root:

```
speech Layer ─ SpeechHost ───────▶ actor-speech-model
```

Up, from the leaves:

```
actor-speech-model ─ Worker load, in Loading ────────▶ Sends Loaded
actor-speech-model ─ Worker remove, in Off ──────────▶ deletes the model and the wish
actor-speech-model ─ Worker download, in Downloading ▶ Sends Fetched, Downloaded, DownloadFailed
```

The front door follows two rules. Everything the caller does is a Message to
the root. Everything the caller reads is the root's State; a transcription is
a Query of the root while Ready.

## actor-speech-model

**Does**: keeps the Speech to Text model on disk while it is switched on, and
transcribes with it.
**Input**: none.
**Model**: none.
**States**: Loading: nothing. Off: nothing. Downloading: done, total: the
bytes of the model on disk, of the total once the server says it. Ready:
nothing. Failed: reason. Loaded moves Loading to Off, Downloading or Ready.
Enable moves Off and Failed to Downloading. Downloaded moves Downloading to
Ready; DownloadFailed moves it to Failed. Disable moves every State to Off.
**Messages**: Enable, Disable: the front door. Loaded: the load Worker.
Fetched, Downloaded, DownloadFailed: the download Worker.
**Commands**: none.
**Workers**: load: in Loading; reads the wish and the files; Sends Loaded.
remove: in Off; forgets the loaded model and deletes the folder. download:
in Downloading; keeps the wish, fetches the model; Sends Fetched about 200
times, then Downloaded or DownloadFailed.
**Requires**: SpeechHost: all three Workers and the transcribe Query.
**Provides**: none.
**Services**: none in the tree: speech.ts builds SpeechHost from SpeechToText
and the folder the caller names.
**Children**: none.
**View**: none.

### Decisions

- **The tree is private behind a plain service, not a door of its own**,
  because the caller wants to switch Speech to Text on, watch it and
  transcribe, not to run an Actor. Caveat: `Speech.layer` starts a Runtime
  of its own beside the caller's.
- **The State is what is on disk, not a Model field beside a status**,
  because each State holds different data and owns the Worker that makes the
  disk match it: Off deletes, Downloading fetches. Caveat: Off deletes the
  folder each time it starts, at every start with Speech to Text off too;
  there is nothing to delete then.
- **Deleting is a Worker of Off, not a Command of Disable**, because a
  restart with the wish gone must find nothing on disk, and a Worker starts
  from the State alone. Caveat: SpeechHost makes the delete wait for a fetch
  that Disable stopped to let go of the folder.
- **The root loads itself in a Loading State, not from Input**, because what
  is on disk decides the first State. Caveat: the front door waits for the
  State after Loading before it opens.
- **A transcription is a Query of Ready, not a Message**, because the caller
  needs the text, and a Query is askable only while Ready. Leaving Ready
  interrupts it. Caveat: the front door answers SpeechToTextNotReady itself
  in every other State.
- **The loaded model is kept in SpeechHost, not by a Worker in Ready**,
  because a Query cannot reach what a Worker holds, and loading on the first
  transcription is the host's job. Caveat: remove forgets it, so it lives
  as long as the files do, not as long as Ready.
- **The SpeechToText contract and sherpa-onnx sit beside the tree, not in
  it**, because the caller's Layer picks the model, and tests give the fake.
