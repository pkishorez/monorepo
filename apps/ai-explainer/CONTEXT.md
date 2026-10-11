# CONTEXT — ai-explainer

Narrated explainer videos for working developers, mostly about the ideas
behind this monorepo but on any topic, built on a shared visual and storytelling language that is
discovered together, one decision at a time. Definitions only; no
implementation detail.

## Language

### The shared language

**Foundation**:
Everything every Explainer shares: the agreed look, voice, motion, sound and
Scenes, plus the machinery that turns an Explainer into video.
_Avoid_: Base, theme, template, engine

**Scene**:
A Foundation building block, such as a hook or a code walkthrough, that an
Explainer fills with its own content.
_Avoid_: Slide, shot, section

**Explainer Format**:
The agreed structure every Explainer follows: its arc of scenes, what each
scene must achieve, and how narration and picture divide the work. It grows
from Explainer Picks that are judged to apply beyond one Explainer.
_Avoid_: Template, script structure, outline

**Explainer**:
One narrated video about one idea, on any topic, built from the Foundation and shaped by
the Explainer Format. It is finished once its video is generated; afterwards
it is kept as a record, and later Foundation changes may leave it broken
until someone reopens it.
_Avoid_: Episode, lesson, tutorial, launch video

**Walkthrough**:
A narrated tutorial that builds up a live app chapter by chapter, slowly
enough to follow, in one frame: the code on the left and the running app on
the right, or the app beside its devtools. Each chapter is named after the
idea it teaches and ends on the question the next one answers. Unlike an
Explainer it follows the app's chapters, not the Explainer Format.
_Avoid_: Showcase, demo video

**Storyboard**:
A Walkthrough's beats in order, played live in the docs app: the place its
narration and pictures are agreed before it is recorded.
_Avoid_: Showreel (the page's name only), script, outline

**Beat**:
One line of a Walkthrough's narration with what happens on screen while it
is said. A beat lasts as long as its line, plus the silence around it, or
longer when what happens on screen takes longer.
_Avoid_: Scene (a Foundation building block), shot, step

**Take**:
How one beat is recorded: how long it holds, and what the cursor does in the
app, and when.
_Avoid_: Clip, script

### Deciding together

**Round**:
One exploration step that settles a single question about either the
Foundation (such as typography or narration voice) or one Explainer (such as
its middle scene).
_Avoid_: Iteration, sprint, experiment

**Prototype**:
One candidate answer to a Round's question, shown alongside its rivals so they
can be compared.
_Avoid_: Variant, option, mock

**Pick**:
The chosen Prototype of a Round, together with the rejected ones and the
reason for the choice. Picks are the record the Foundation is built from.
_Avoid_: Selection, winner, vote

**Playground**:
The place where a Round's Prototypes are viewed side by side and a Pick is
made.
_Avoid_: Gallery, showcase, storybook
