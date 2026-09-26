# STT — Ubiquitous Language

## Terms

**Session**
One run from the moment the user starts transcribing to the moment they stop.
A session owns one audio clock, one transcript and every injection made while
it runs. Nothing outside a session can be injected into it, and a stopped
session never changes again. If the microphone or the speech model fails
mid-run, the session ends there and its transcript is frozen as it stands.

**Audio clock**
The session's timeline in seconds, counted from the first captured audio
sample. Every spoken word and every injection is positioned on this clock, never
on text. The clock is the only thing that makes an injection land at the right
place when the transcript is slow.

**Transcript**
The ordered list of segments of a session. While the session runs, the tail of
the transcript is provisional; once it stops, the whole transcript is final.

**Segment**
One item of a transcript. A segment is either a _transcription segment_ or an
_injected segment_, and the transcript is nothing but these two kinds in order.

**Transcription segment**
A run of spoken words with a start and end on the audio clock. Words come from
the speech model; the app never invents or edits them.

**Injected segment**
A segment created by an injection. It carries the injection's payload and sits
between the transcription words that surround its audio-clock time.

**Injection**
The act of the user pressing a context button at some instant of the session.
An injection records the audio-clock time of the press and the button's
payload. Injections are immutable: once made they are never moved, edited or
removed. Injections made after the session stops are ignored.

**Placement**
The rule that turns an injection's time into a position among words. An
injection lands after every word that started before its time, so a word
already under way at the press stays ahead of it. Before the first word it
lands at the start; during silence it lands after the last spoken word; several
injections with no words between them keep their press order.

**Pass**
One run of the speech model over the stretch of audio that is not yet
frozen. Passes repeat about once a second while a session runs, and a last
pass follows the stop. Each pass returns the words it heard with their times;
the session keeps a report of every pass so a run can be diagnosed.

**Provisional word / final word**
A word the speech model may still revise is provisional. Words far enough
behind the newest audio are final and never change. An injected segment shows
at once among provisional words and may move as those words become final; it
never moves after that.

**Context button**
A control in the demo that performs an injection with a fixed payload.

**Payload**
The data an injection carries. The language does not fix its shape: the demo
uses text, an application may use any structured value. How payloads and words
are combined into copyable text or markdown is the application's choice, not
the session's.

**Speech model**
The English speech-to-text model that runs on the user's graphics hardware in
the browser. The user chooses one of two models before anything else, and the
page cannot be used until it has loaded. If the hardware cannot run it, the
page reports that and offers nothing else.
