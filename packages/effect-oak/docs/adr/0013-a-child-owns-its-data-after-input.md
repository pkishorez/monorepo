# A Child owns its data after its Input

A parent hands a Child its Input when it Invokes it, and the Child's init starts from it. After that the Child owns the data: the parent keeps only the key (for a list, the ids), and a parent that needs a Child's data gets it through a Request.

## Considered Options

- **The Child reads its entry in the parent's Model live, through a Capability**: rejected. The same data would live in two places, with a rule to keep them in step.
