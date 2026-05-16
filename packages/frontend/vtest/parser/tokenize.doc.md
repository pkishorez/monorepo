---
title: tokenize
---

# tokenize

A toy tokenizer for arithmetic expressions over integers.

```
expr   = term { ('+' | '-') term }
term   = factor { ('*' | '/') factor }
factor = INT | '(' expr ')'
```

The tokenizer emits:

| Token      | Match               |
| ---------- | ------------------- |
| `NUMBER`   | `/[0-9]+/`          |
| `OP`       | `+ - * /`           |
| `LPAREN`   | `(`                 |
| `RPAREN`   | `)`                 |

This module pulls double duty: it also stress-tests the docs **snippet
extractor**, since the test bodies below contain template literals with
`${}` interpolation, nested arrow functions, single- and double-quoted
strings containing `(`, and inline comments — all things the lexical
scanner in the reporter has to navigate to find the matching `)`.
