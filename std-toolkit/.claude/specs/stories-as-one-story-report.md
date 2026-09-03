# Stories verification report

`tsx check.ts */*/*.story.ts` → `all questions passed` (58 story files, 0 failures) · `pnpm stories` → `✓ 58/58 stories · 58 passed` · `pnpm lint` → passes (`vp check` 605 files clean, `tsc` clean, `laymos lint`: no layer violations, no module violations, every Story Group has a page).

## Per-act check summary

All proofs pass on every act, both under `check.ts` and under the laymos runner:

- Act I (ch01–08): 8 stories passed.
- Act II (ch09–16): 8 stories passed.
- Act III (ch17–23): 7 stories passed.
- Act IV (ch24): 1 story passed.
- Act V (ch25–35): 11 stories passed.
- Appendix (a1–a8): 23 stories passed.

The laymos report lists all 35 spine chapters in numeric order under six groups (five acts + appendix), one root.

## Integration breaks found and fixed

1. **Act V was not wired into the story tree.** `stories/05-in-the-browser/index.ts` imported only chapter 25; chapters 26–35 were missing, so `pnpm stories` ran 48 stories, not 58. Fixed: all eleven chapters are now in the barrel, in reading order.
2. **`pnpm stories` deadlocked at its default concurrency.** `laymos stories` runs stories in-process with concurrency 16; the suite hangs partway (stuck at 15/48 indefinitely, near-zero CPU) — cross-story interference between concurrent proofs sharing real databases/leadership. Sequentially it passes cleanly, so `package.json` now pins `"stories": "laymos stories -c 1"`. Worth a look upstream if concurrent runs are wanted back.
3. **Root group had no page.** Added `stories/std-toolkit.md` (three plain sentences, no API names).
4. **Act IV group page was in the wrong folder.** laymos resolves a group page in the common folder of the group's stories; with one chapter, that is the chapter folder. Moved `the-same-code-on-other-databases.md` into `04-other-databases/24-swapping-memory-for-sqlite-indexeddb-dynamodb/`.
5. **Formatting failures.** Ran `vp fmt` on `.claude/specs/stories-old-questions.md`; fixed the `no-useless-spread` at `28-catching-up-on-what-you-missed.story.ts` (`[...pages.flat()]` → `pages.flat()`); deleted a stale untracked scratch file `std-toolkit/sections-check.tmp.ts` (a copy of check.ts) that failed `vp check`.

## DynamoDB caveats

The suite needs local DynamoDB at `http://localhost:8090` (user-run docker); it was reachable throughout. DynamoDB-backed proofs (ch24, a4, a8, and the four-adapter checks) create and delete real tables, so runs are slower there and require the container.

## Coverage audit (stories-old-questions.md, row by row)

All rows verified against the running chapters' questions and assertions. Every mapped question is answered, with these notes:

- **Gap — ch19**: `read-draft-write-latest` Q3 ("Does a Snapshot taken while a draft exists look any different from one taken before it?") is not answered anywhere in chapter 19 (no Snapshot question or assertion). Everything else in that row is covered.
- **Gap — ch33**: from `leadership/one-reader-many-tabs`, "Can two notebooks lead separately?" and "Can a tab that is waiting still write?" are not demonstrated; the other three sub-questions are.
- **Reframed — ch32**: `two-browsers-one-backend` (Bob on his own machine, Bob loses his connection) is retold as two tabs of one browser with peer sync off; the substance (server as shared truth, what a lost link costs) is covered.
- Sub-questions that looked missing from headline questions but are covered inside proofs: ch05 skip/missing writes (`NoItemToUpdate`, `CheckRefused`), ch15 settings applying a rule to themselves (`settings.unchangedOp`), ch16 write-nobody-subscribed and filter-move-away, ch17 "does the app learn which version", ch20 adopt-then-grow, ch22 before/after-edit rows and index-only structural change.
- The dropped list at the bottom of the checklist is exactly what is absent — nothing else silently vanished (the 10 temporarily missing Act V stories were a wiring break, now fixed; their questions all run).

## Style spot-audit (two chapters per act + a3)

Fixed (trivial):

- Too-long answers trimmed to two sentences: ch15 Q1, ch24 Q1 and Q2, ch26 Q1, ch33 Q3.
- Too-long page intros trimmed to three sentences: ch24, a3 `a-migration-must-not-look-around`.

Left as found (listed, not fixed — beyond trivial):

- **Proofs returning projections instead of the taught call's value** (rule 6): ch08 all three proofs; ch22 all three (rendered strings/tags); ch26 returns `write.state` strings; smaller cases in ch04 Q3, ch15 Q3, ch18 Q3.
- **Comment discipline** (rule 5): ch26 and ch33 leave app/collection/screen setup blocks uncommented; ch22 Q3 has two uncommented mid-sequence steps; ch33 has one near-duplicate stacked comment; ch15 has two "Save the task and read it" comments describing a read that never happens.
- **Glossing gaps** (rule 3): "op" (ch15), "layer" (ch24), "collection" (ch26), "peer sync" (ch33), "cursor"/"sort key" (ch08), "CI"/"diff" (ch22).
- **Borderline titles** (rule 1): "When the task changed under you", "Only one tab talks to the server", "A migration must not look around", "Append a version, never edit one" are clauses/sentences rather than gerund phrases — consistent with the tree's voice, so left alone.
- a3 `checking-a-partial-update` puts API names in its story description (page prose is clean).

Hygiene greps all clean: no `support.ts` references, no `parity(`, no `eventuallyShows`, no `console.log` in story files.

## Left for the user

- Decide whether ch19 should gain the Snapshot-during-a-draft question and ch33 the two leadership sub-questions, or whether those rows join the dropped list.
- The `laymos stories` concurrency deadlock is pinned around, not root-caused; if parallel story runs matter, that is a laymos/std-toolkit investigation.
- The non-trivial style items above, if the six rules are to hold strictly everywhere.
