---
name: foundation
description: Add, improve or remove a part of the explainer Foundation (look, voice, motion, sound, Scenes) through a Round of three Prototypes. Use when the user wants to change anything every Explainer shares.
---

Read `docs/foundation.md` and `CONTEXT.md` first. Apply any Pick whose
`PICK.md` still says `status: picked` before starting new work.

1. **Grill.** Run the `grilling` skill until you share an understanding of
   which part of the Foundation to add, improve or remove, exactly what the
   user dislikes, and anything they have seen and liked. Do not build until
   the user confirms that understanding.
2. **Choose the spread** and say it before building. Always three variants. A
   broad ask gets three genuinely different directions, never small tweaks of
   one idea. A narrow ask gets three subtle variations of the current answer.
3. **Build the Round** in `src/playground/rounds/<NN>-<slug>/round.tsx` with
   `defineRound`: exactly three Prototypes, each the laymos pilot Explainer restyled one way so they compare fairly. Keep all Round code inside
   the Round folder.
4. **Hand over:** run `pnpm playground <NN>-<slug>`, which starts the
   Playground if needed and opens the Round in the browser. Tell the user to
   Pick there and come back. Stop here.
5. **Apply the Pick** when `PICK.md` says `status: picked`: move the winner into `src/foundation`, update `docs/foundation.md`, and
   keep every Explainer compiling. Then
   delete everything in the Round folder except `PICK.md`, and set
   `status: applied`.
