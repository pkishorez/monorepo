---
'laymos': patch
'@kstackz/devtools': patch
---

Stories are now a tree that teaches a Project. A Story is a folder with a `story.md` Telling: a title, a one-line pitch, and a body that links each sub-Story by its id (`std-toolkit/evolving-schema`); link order is display order. The one-claim files are now Proofs (`*.proof.ts(x)`, `Proof.make` / `Proof.browser`). `laymos lint` reports a missing or incomplete Telling, a broken link, and a sub-Story the Telling never names. Browser Proofs now run at human pace. The DevTools Stories tab is an explorable space: Story cards open in place to show their Telling, Proof tallies roll up the tree, cards can be dragged, and a Proof opens a larger panel with a full-screen player and 0.5×/1×/2× speed.
