# Defining evolutions

The ladder, built one rung at a time.

Read these four in order. Each Story declares one more `.evolve(...)` than the
one before it, so the code in the setup block grows by exactly one rung per page:

1. **Notes can be pinned** — a field is added.
2. **Colour is dropped** — a field is removed.
3. **Body becomes text** — a field is renamed, which is a remove and an add in
   one delta.
4. **The whole ladder at once** — all three rungs run end to end, and the last
   question proves that the ladder you just watched being built is the `Note`
   every later Story imports from `support.ts`.

That last proof is the handoff. From here on the ladder is assumed, not shown.
