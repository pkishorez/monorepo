# Live Dictation plan

A Dictation records no matter what, sends its audio to the Connection as it
records, and gets its text back as it goes. Connection choice and recovery
come later; this is the end-to-end path.

## Why

- Starting needed a Connection that answers and says Speech to Text is
  Ready. Before its socket answers, nothing is known, so a fresh start or an
  iPhone coming back from the background said "Voice isn't on · Settings".
- The whole clip went up as one `transcribe` call: base64 in JSON, about
  2.5 MB a minute. The RPC client pings every 5 s and drops a socket that
  says nothing back for that long. A browser cannot send the ping until the
  big message is out, so a long clip on a slow uplink killed its own socket,
  and Retry sent it again.
- Effect RPC streams answers, not payloads, so a stream in is many small
  calls under one id.

## The shape

One Take per Dictation, named by a random id, on the Owner's Connection.

| Call           | What it does                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------- |
| `watchTake`    | Streams what is heard: `Downloading { done, total }`, `Heard { text }`, then `Done { text }`. |
| `addTakeAudio` | One numbered stretch of about 2 s of PCM. Sending one again is harmless.                      |
| `endTake`      | How many stretches there are. Once all are in, the stream ends with `Done`.                   |

Each call can come first: a Take starts with whichever reaches it. Watching
again, as after a reconnect, starts from what is heard now.

## The Connection

- A Take on a Connection with Speech to Text off switches it on. While the
  model downloads, the Take streams the progress and keeps the audio.
- Parakeet stays the model. Each time audio comes in, the Take transcribes
  what is not settled yet, its tail, and streams the settled text with it.
  A tail past about 12 s is cut at its quietest moment, and the part before
  the cut settles, so each pass stays short. At the end, the tail is
  transcribed once more and settles.
- A Take nobody touches for 10 minutes is dropped.
- A streaming model, such as NVIDIA's Nemotron Speech Streaming in
  sherpa-onnx 1.13.4 and later, could take Parakeet's place behind the same
  three calls.

## The app

- The Recorder gives the last recording's audio as a stream: what it has
  so far, then each chunk as it comes, ending as the recording ends.
- The Dictation starts whenever a field asks, and opens the microphone at
  once. Its Child, the new **Take** Actor, lives while the Dictation records
  and is written out. One Worker sends the audio in stretches of about 2 s,
  then `endTake`; another watches the Take and tells the Dictation what is
  heard.
- The Dictation shows the download, or the text so far, while it records,
  and puts the text in its field when the Take is `Done`. Retry sends the
  kept recording again as a new Take.
- Availability is Ready, or Busy while another field records. Nothing else
  stops a Dictation starting.

## What it looks like

- **Starting.** The mic always records. The Touch Draft drops its keyboard
  as a Dictation starts.
- **Minimized.** A card floats just above the Touch Draft: two lines at
  most, the newest words in full and the line before them dimmed. As the
  second line fills, both move up a line, and each new word fades in from
  a blur.
- **Open.** The words heard show as ghost text in the Draft, at the cursor:
  dimmed, never selected, never sent. While it records, the ghost follows
  the cursor: a tap places it, and a tap in the words lets the user type
  around it. Once stopped, it stays put until the text takes its place.
  The newest words stay scrolled into view.
- **First time on a Connection.** The floating card says "this only
  happens once on this machine", how far voice has downloaded, and to keep
  talking. The words are kept and written out once voice is ready.
- **A blocked microphone.** iOS Safari at times blocks the microphone on
  its own until the page loads again. A dialog offers to reload; the Draft
  is kept.
- **Opening the Touch Draft.** One tap opens it without the keyboard, so
  the model can be changed and it can be minimized again. A tap in its
  words then edits.

## Later

- Choosing another Connection when the Owner's is not there, and moving a
  Take to it.
- Keeping a Take's audio on disk so a Connection restart loses nothing.
- Retiring `transcribe`, once nothing calls it.
