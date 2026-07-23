# Laymos Tests

`LaymosTests` renders a controlled Test catalog with optional execution
evidence. It derives pass or failure by comparing expected and actual results;
the report does not store an outcome or diff.

Strings default to an inferred text, Markdown, or code presentation. Readers
can override that presentation and switch between side-by-side and stacked
comparisons without changing the authored Test or its report. Code is
highlighted with Shiki, defaults to TypeScript, and exposes a language selector
when code is visible. Test Cases are collapsed by default and can be expanded
or collapsed together; every row shows the authored Test Case name and
description plus its positive or negative intent. Passing cases show one
deduplicated result; only failures show the expected-versus-actual comparison.
