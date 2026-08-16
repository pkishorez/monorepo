# Sync Replica and Peer Sync Refactor Progress

This file is the live handoff for the work defined in `execute.md`. Update it during every task. Keep entries factual and concise; do not mark a task complete until its completion criteria and checks pass.

## Overall Status

- State: In progress
- Current task: Task 2 — names, qualified collection names, and addresses
- Next action: Record Task 1's commit hash, then implement Task 2

## Task Tracker

| Task                                                    | Status      | Commit | Checks                                       |
| ------------------------------------------------------- | ----------- | ------ | -------------------------------------------- |
| 1. Establish the `sync` context and package paths       | Complete    | —      | Focused tests, lint/TypeScript/Laymos, build |
| 2. Add names, qualified collection names, and addresses | Not started | —      | —                                            |
| 3. Rename persistence concepts and APIs                 | Not started | —      | —                                            |
| 4. Build the Peer Sync deep module                      | Not started | —      | —                                            |
| 5. Integrate Peer Sync with replica convergence         | Not started | —      | —                                            |
| 6. Finish events, documentation, and stories            | Not started | —      | —                                            |
| 7. Final verification and cleanup                       | Not started | —      | —                                            |

Use only these statuses: `Not started`, `In progress`, `Blocked`, `Complete`.

## Current Task

### Scope

Task 2 requires a stable normalized Sync name, qualified Collection names, and display-only Sync Addresses while preserving exact typed partition identities.

### Work Completed

- Task 1 renamed the source context and public implementation to `src/sync` and `sync.ts`.
- Public exports and TypeScript aliases now use `std-toolkit/sync` and `std-toolkit/sync/paced`, with no compatibility aliases.
- Stories, tests, telemetry identifiers, and Laymos paths/layers now use the Sync context name.

### Checks Run

- `pnpm --filter std-toolkit exec vitest run src/sync stories/sync/simulation.test.ts` — passed, 16 files and 89 tests.
- `pnpm --filter std-toolkit lint` — passed; formatting/lint, TypeScript, and Laymos all clean, with no layer or module violations.
- `pnpm --filter std-toolkit build` — passed.

### Remaining Work

- Record Task 1's commit hash in the Task 2 commit.
- Complete Tasks 2–7 in order.

## Decisions and Discoveries

Append facts learned during implementation that affect later tasks. Do not repeat the settled requirements from `execute.md`.

- The workspace uses `effect@4.0.0-beta.102`, but no `node_modules/effect/AGENTS.md` exists anywhere in the repository.

## Blockers

Record the exact failing command, missing dependency, or external requirement and what is needed to continue.

- None.

## Deviations

Record any necessary departure from `execute.md`, why it was necessary, and its effect on public behavior. Do not silently change the plan.

- The user explicitly overrode the missing `node_modules/effect/AGENTS.md` prerequisite and directed execution to continue using established repository practices. Task 1 changed no Effect behavior.

## Final Verification

- [ ] `pnpm --filter std-toolkit lint`
- [ ] `pnpm --filter std-toolkit build`
- [ ] `pnpm --filter std-toolkit stories`
- [ ] `pnpm --filter std-toolkit test`
- [ ] Sync-specific Memory and IndexedDB peer tests
- [ ] Search for stale public paths and terminology
- [ ] Review generated public declarations

## Handoff Notes

At the end of each task:

1. Replace the Current Task details with the next task.
2. Add the completed task's commit hash and check summary to the tracker.
3. Preserve useful discoveries and unresolved blockers.
4. Leave the worktree free of uncommitted task changes; unrelated user changes may remain.

When all tasks are complete, replace Overall Status with `Complete` and summarize any external checks that could not run.
