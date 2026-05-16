---
title: slugify
---

# slugify

Turns arbitrary text into a URL-safe slug. Diacritics are stripped via NFD
normalisation; runs of non-alphanumerics collapse to a single hyphen.

```ts
slugify('Héllo, World!');   // 'hello-world'
slugify('  --leading--  ');  // 'leading'
```

## Why NFD?

Unicode lets the same visible glyph be encoded multiple ways. NFD splits
characters into base + combining marks so the diacritics can be filtered
with a single regex, regardless of source encoding.
