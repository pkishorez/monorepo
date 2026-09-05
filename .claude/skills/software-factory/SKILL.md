---
name: software-factory
description: Set up web applications in pnpm monorepos, or build features in existing applications with STD toolkit, Effect, RPC toolkit, and TanStack DB sync.
---

# Software factory

## Start here

Use the user's request to identify the next task.

If the task is unclear, ask: “Would you like to set up a web application or work on an existing one?”

For a new web application, follow [web setup](applications/web/setup/guide.md).

For an existing application, inspect its code and reuse decisions already made.

If setup is unfinished, resume the relevant section of [web setup](applications/web/setup/guide.md).

Once setup is complete, follow [the feature workflow](core/feature.md).

For additional infrastructure, use [setup discovery](applications/web/setup/guide.md) for the requested change and preserve the existing application.

## Working rules

Read only the guide needed for the current step.

Use [shared architecture](core/architecture.md) for shared, server, and client boundaries.

Use [the glossary](core/CONTEXT.md) when toolkit terminology needs clarification.

Inspect existing code and installed APIs before implementing.

Follow confirmed user preferences over defaults in these guides.

Ask focused questions about unresolved choices and keep bootstrap within the requested scope.

Write short, readable Effect workflows with blank lines between logical sections.

Check affected behavior, types, and architecture rules.
