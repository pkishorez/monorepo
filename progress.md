# Sync Replica and Peer Sync Refactor Progress

This file is the live handoff for the work defined in `execute.md`. Update it during every task. Keep entries factual and concise; do not mark a task complete until its completion criteria and checks pass.

## Overall Status

- State: In progress
- Current task: Task 3 — persistence concepts and convergence APIs
- Next action: Record Task 2's commit hash, then implement Task 3

## Task Tracker

| Task                                                    | Status      | Commit                                   | Checks                                        |
| ------------------------------------------------------- | ----------- | ---------------------------------------- | --------------------------------------------- |
| 1. Establish the `sync` context and package paths       | Complete    | 18adf8cb058070b35cd725f8f7eed72627e22cd7 | Focused tests, lint/TypeScript/Laymos, build  |
| 2. Add names, qualified collection names, and addresses | Complete    | —                                        | 104 sync tests, lint/TypeScript/Laymos, build |
| 3. Rename persistence concepts and APIs                 | Not started | —                                        | —                                             |
| 4. Build the Peer Sync deep module                      | Not started | —                                        | —                                             |
| 5. Integrate Peer Sync with replica convergence         | Not started | —                                        | —                                             |
| 6. Finish events, documentation, and stories            | Not started | —                                        | —                                             |
| 7. Final verification and cleanup                       | Not started | —                                        | —                                             |

Use only these statuses: `Not started`, `In progress`, `Blocked`, `Complete`.

## Current Task

### Scope

Task 3 renames persistence concepts and APIs and changes accepted convergence results to contain complete accepted Entities, including tombstones.

### Work Completed

- Task 2 recorded predecessor commit `18adf8cb058070b35cd725f8f7eed72627e22cd7`.
- `createStdSync` now requires and normalizes `name`; collection registration rejects normalized collisions.
- Qualified Collection Names drive TanStack collection IDs, persistence keys, change-notice channels, flow addresses, and structured event labels while backend `_e` routing retains the original schema name.
- The pure `domain/sync-address` deep module constructs normalized Sync, Collection, partition, and strategy display addresses without replacing typed partition identity.

### Checks Run

- `pnpm --filter std-toolkit exec vitest run src/sync stories/sync/simulation.test.ts` — passed, 18 files and 104 tests.
- `pnpm --filter std-toolkit lint` — passed; formatting/lint, TypeScript, and Laymos all clean, with no layer or module violations.
- `pnpm --filter std-toolkit build` — passed.

### Remaining Work

- Record Task 2's commit hash in the Task 3 commit.
- Complete Tasks 3–7 in order.

## Decisions and Discoveries

Append facts learned during implementation that affect later tasks. Do not repeat the settled requirements from `execute.md`.

- The workspace uses `effect@4.0.0-beta.102`, but no `node_modules/effect/AGENTS.md` exists anywhere in the repository.
- Source of Truth now accepts a separate qualified storage collection name while validating Entity `_e` against the schema's original name; Task 3 should preserve this split during the Sync Replica rename.
- Change-notice channels now use the qualified Collection Name directly; Task 4 can consume the same name when replacing them with Peer Sync.

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
