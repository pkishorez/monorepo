# Defining evolutions

These four Stories add one step each. Read them in order.

Each Story declares one more `.evolve(...)` than the Story before it. The setup
code becomes one step longer on each page.

1. **Notes can be pinned.** A field is added.
2. **Colour is dropped.** A field is removed.
3. **Body becomes text.** A field changes its name. This is one remove and one
   add in the same step.
4. **The whole ladder at once.** All three steps run together. The last question
   proves that the schema you built is the `Note` that the other Stories import
   from `support.ts`.

That last proof is the handover. After it, the Stories use the schema and do not
show it again.
