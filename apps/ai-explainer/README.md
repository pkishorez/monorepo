# ai-explainer

Narrated explainer videos on any topic, built on a Foundation discovered through prototype Rounds.

## Big picture

Every Explainer is built from one shared Foundation: look, voice, motion,
sound and Scenes. Improve the Foundation once and every later Explainer
uses it.

Foundation parts: [docs/foundation.md](./docs/foundation.md). Explainer
structure: [docs/explainer.md](./docs/explainer.md). Terms:
[CONTEXT.md](./CONTEXT.md). Decisions: [docs/adr/](./docs/adr/).

## Usage

### Change the Foundation

Add, improve or remove any part: animation, music, voice, look, a Scene.

1. Run `/foundation` in Claude Code and say what you want to change.
2. Answer Claude's questions.
3. Claude opens the Playground in your browser. Watch the three variants,
   Pick one and say why.
4. Tell Claude you picked. It applies the Pick and deletes the variants,
   keeping only your `PICK.md`. Every later Explainer uses it.

### Make an Explainer

1. Run `/explainer <topic>` with any topic and answer Claude's questions.
2. Approve the script.
3. Watch the result with `pnpm studio`.

### Change the Explainer Format

Run `/explainer <name>` on an existing Explainer and say what to change.
Pick one of three variants as above. Claude asks whether the change applies to
future Explainers too.
