---
status: accepted
---

# Model terminal flow endings as authored Blocks

Laymos models a Terminal as a distinct, indivisible Story Block that documents
the end of one sequential branch in its nearest containing Flow, or in Story
execution when no Flow contains it. A Terminal executes like a Step and does
not alter application control flow; Trace Mode closes only its structural
branch, while completed Scenario evidence fails validation when it continues
along that branch or contradicts the Terminal's required success or named error
completion. This preserves side-effect-free tracing and branch-local behavior,
including parallel branches, without pretending Laymos can prove arbitrary
JavaScript or Effect control flow.

## Consequences

- A caller outside the Terminal's Flow continues normally, and parallel sibling
  branches remain open.
- Error names are required and descriptive because Block errors are not
  captured or matched at runtime.
- The visualization distinguishes success and named error Terminals; runtime
  mismatches remain a separate failure state.
- Story ejection erases Terminal narration while preserving its underlying
  Effect operation.
