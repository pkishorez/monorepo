# Sync Replica and Peer Sync Refactor Progress

This file is the live handoff for the work defined in `execute.md`. Update it during every task. Keep entries factual and concise; do not mark a task complete until its completion criteria and checks pass.

## Overall Status

- State: In progress
- Current task: Task 4 — Peer Sync deep module
- Next action: Record Task 3's commit hash, then replace Change Notice with Peer Sync

## Task Tracker

| Task                                                    | Status      | Commit                                   | Checks                                        |
| ------------------------------------------------------- | ----------- | ---------------------------------------- | --------------------------------------------- |
| 1. Establish the `sync` context and package paths       | Complete    | 18adf8cb058070b35cd725f8f7eed72627e22cd7 | Focused tests, lint/TypeScript/Laymos, build  |
| 2. Add names, qualified collection names, and addresses | Complete    | ca0db797aa68c30b7d38a7201b2f89417ec07179 | 104 sync tests, lint/TypeScript/Laymos, build |
| 3. Rename persistence concepts and APIs                 | Complete    | —                                        | 105 sync tests, lint/TypeScript/Laymos, build |
| 4. Build the Peer Sync deep module                      | Not started | —                                        | —                                             |
| 5. Integrate Peer Sync with replica convergence         | Not started | —                                        | —                                             |
| 6. Finish events, documentation, and stories            | Not started | —                                        | —                                             |
| 7. Final verification and cleanup                       | Not started | —                                        | —                                             |

Use only these statuses: `Not started`, `In progress`, `Blocked`, `Complete`.

## Current Task

### Scope

Task 4 replaces Change Notice with the Peer Sync deep module and its testable channel contract.

### Work Completed

- Task 2 recorded predecessor commit `ca0db797aa68c30b7d38a7201b2f89417ec07179`.
- `source-of-truth` and `sync-persistence-table` are now the `sync-replica` and `sync-store` deep modules, with renamed stored schemas, records, spans, and public `storeLayer` configuration.
- `applyToSyncReplica` is the convergence operation used by strategies, cadence repair, mutations, registry persistence, keyed sync, single-item sync, and manual writes.
- Accepted convergence results are complete Entities, including tombstones; stale valid entities return an empty accepted result.

### Checks Run

- `pnpm --filter std-toolkit exec vitest run src/sync stories/sync/simulation.test.ts` — passed, 18 files and 105 tests.
- `pnpm --filter std-toolkit lint` — passed; formatting/lint, TypeScript, and Laymos all clean, with no layer or module violations.
- `pnpm --filter std-toolkit build` — passed.

### Remaining Work

- Record Task 3's commit hash in the Task 4 commit.
- Complete Tasks 4–7 in order.

## Decisions and Discoveries

Append facts learned during implementation that affect later tasks. Do not repeat the settled requirements from `execute.md`.

- The workspace uses `effect@4.0.0-beta.102`, but no `node_modules/effect/AGENTS.md` exists anywhere in the repository.
- Sync Replica accepts a separate qualified storage collection name while validating Entity `_e` against the schema's original name.
- Change-notice channels now use the qualified Collection Name directly; Task 4 can consume the same name when replacing them with Peer Sync.
- Public `applyToSyncReplica` returns only complete entities accepted by convergence, which Task 5 can broadcast directly; internal strategy and registry adapters intentionally discard that result.

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
