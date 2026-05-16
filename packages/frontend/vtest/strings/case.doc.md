---
title: case
---

# case

Case conversions for identifier-shaped strings. All converters round-trip
between word-tokens and the target style; non-alphanumeric characters act
as token separators.

| Function     | Input            | Output           |
| ------------ | ---------------- | ---------------- |
| `camel`      | `"hello world"`  | `"helloWorld"`   |
| `pascal`     | `"hello world"`  | `"HelloWorld"`   |
| `kebab`      | `"helloWorld"`   | `"hello-world"`  |
| `snake`      | `"helloWorld"`   | `"hello_world"`  |

The tokenizer treats a transition from lower→upper as a boundary, so
`HTTPServer` becomes `["HTTP", "Server"]` rather than splitting the
acronym. That choice is deliberate — see the *acronyms* suite below.
