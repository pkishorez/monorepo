---
name: explainer
description: Create a new Explainer video on any topic, or improve an existing one through a Round of three Prototypes. Use when the user wants an explainer video, or wants to change an Explainer or the Explainer Format.
---

Read `docs/explainer.md`, `docs/foundation.md` and `CONTEXT.md` first. Apply
any Pick whose `PICK.md` still says `status: picked` before starting new work.

## New Explainer

1. **Grill.** Run the `grilling` skill until you share an understanding of
   the topic, the one idea the viewer should leave with, and the tension that
   makes it worth watching. When the topic touches this monorepo, read the
   related README and code yourself.
   Do not write until the user confirms that understanding.
2. **Write** `script.ts` following the Format's arc and narration rules, and
   show it to the user. Change it until they approve.
3. **Build** the Explainer in `src/explainers/<name>/` from Foundation Scenes,
   register it in `src/studio.tsx` and `laymos.config.json`, then run
   `pnpm voiceover <name>`, `pnpm lint` and `pnpm render <name>`.
4. Tell the user to watch it with `pnpm studio`.

## Improve an Explainer

1. **Grill.** Run the `grilling` skill until you share an understanding of
   what works, what does not, and anything the user has seen that does it
   better. Do not build until the user confirms that understanding.
2. **Choose the spread** and say it. Always three variants: genuinely
   different takes for a broad ask, subtle variations for a narrow one.
3. **Build the Round** in `src/playground/rounds/<NN>-<slug>/round.tsx` with
   `defineRound`: exactly three Prototypes, each a full version of that Explainer. Keep all Round code inside
   the Round folder.
4. **Hand over:** run `pnpm playground <NN>-<slug>`, which starts the
   Playground if needed and opens the Round in the browser. Tell the user to
   Pick there and come back. Stop here.
5. **Apply the Pick** when `PICK.md` says `status: picked`: update the Explainer, then ask whether the lesson applies to every
   future Explainer; if yes, update `docs/explainer.md` too. Then
   delete everything in the Round folder except `PICK.md`, and set
   `status: applied`.
