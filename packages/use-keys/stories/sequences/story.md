# Sequences

Bind keys pressed one after another, like `g g` or `g i`, and show people what they can press next.

Single keys run out fast. A Sequence lets `g` start a family of moves: `g g` to the top, `g i` to the inbox, `g s` to sent.

```tsx
const { pending } = useSequence('g g', () => toTop());
```

After the first key, [the app can show it is waiting](use-keys/sequences/g-g-jumps-to-the-top) for the next one. If the next key [comes too late](use-keys/sequences/a-late-second-key-cancels), the Sequence quietly cancels, so a stray `g` from earlier never fires later. Several Sequences can share a first key and [branch on the next one](use-keys/sequences/sequences-branch-on-the-next-key); a key that finishes none of them cancels them all.

You choose how long a Sequence waits on the provider: `sequence={{ timeout: 1000 }}`.
