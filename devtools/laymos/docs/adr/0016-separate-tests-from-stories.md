---
status: accepted
---

# Separate Tests from Stories

Laymos treats Stories and Tests as different executable concepts: Stories
explain application flow through Scenarios and narrated Blocks, while Tests
stress one functionality through named input-and-expectation cases. Each Test
and Test Case has a required name and description. Each Test Case also declares
positive or negative intent so consumers can distinguish accepted behavior from
expected rejection or failure. Each Test is owned by a folder Module, declares
one Test per file, and is executed only by the Laymos runner; its function may
complete synchronously, through a Promise, or through an Effect.

Test Reports contain only case intent, names and descriptions, primitive
inputs, expected values or named errors, and actual values or errors.
Comparison outcomes, diffs, and value presentation are derived by the frontend,
keeping authoring and runtime reports free of display configuration. AI may
propose cases but cannot add them without author review or adopt the current
actual result as an expectation.
