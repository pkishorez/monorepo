---
'@kestack/kabuki': patch
---

The Router gives every history entry a key no earlier page load gave, and keeps the key an entry already holds: the entry a page opens at after a reload, and one from before it that Back lands on. Before, every page load counted keys from `0` again, so after a reload a new entry could take the key of an old one.
