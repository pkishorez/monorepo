---
'@kestack/kabuki': patch
---

An Actor's type keeps only what Views and code outside the tree read of its behavior: each Child's Actor and kind, and each Query's args, answer and failure. It no longer holds the behavior as written, whose size grew with every level of Children in each hover, error and declaration file, so a deep app no longer fails to emit with TS7056. `ActorType` is now the `Actor` interface itself, and `CommandType` and `Single` are exported, so a declaration file can name an Actor or a Command. `KidsByState` and `QueriesByState` resolve to plain shapes: index them only once their arguments are known.
