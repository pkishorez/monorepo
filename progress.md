# Sync Replica and Peer Sync Refactor Progress

This file is the live handoff for the work defined in `execute.md`. Update it during every task. Keep entries factual and concise; do not mark a task complete until its completion criteria and checks pass.

## Overall Status

- State: Complete
- Current task: None
- Next action: Run the two DynamoDB-dependent package checks when DynamoDB Local is available

## Task Tracker

| Task                                                    | Status   | Commit                                   | Checks                                        |
| ------------------------------------------------------- | -------- | ---------------------------------------- | --------------------------------------------- |
| 1. Establish the `sync` context and package paths       | Complete | 18adf8cb058070b35cd725f8f7eed72627e22cd7 | Focused tests, lint/TypeScript/Laymos, build  |
| 2. Add names, qualified collection names, and addresses | Complete | ca0db797aa68c30b7d38a7201b2f89417ec07179 | 104 sync tests, lint/TypeScript/Laymos, build |
| 3. Rename persistence concepts and APIs                 | Complete | 551a16af58728a3207a0965f3ae958f75da53ec7 | 105 sync tests, lint/TypeScript/Laymos, build |
| 4. Build the Peer Sync deep module                      | Complete | 340d981eec728eb5639256d77ea57bc7cd75b0e1 | 88 sync tests, lint/TypeScript/Laymos, build  |
| 5. Integrate Peer Sync with replica convergence         | Complete | c716f963284ef0dfdd2e16ccdf66ca107ef8c562 | 117 sync/story tests, lint/Laymos, build      |
| 6. Finish events, documentation, and stories            | Complete | 64966bdba2f1befaf38a518bcd8a3dc51dc20819 | 28 Sync stories, focused tests, lint/build    |
| 7. Final verification and cleanup                       | Complete | Recorded in final report                 | 94 Sync tests, 28 Sync stories, lint/build    |

Use only these statuses: `Not started`, `In progress`, `Blocked`, `Complete`.

## Final Summary

### Scope

All seven tasks are complete. The only unavailable verification is the
DynamoDB-dependent portion of the package story and test commands.

### Work Completed

- Task 6 recorded predecessor commit `64966bdba2f1befaf38a518bcd8a3dc51dc20819`.
- Source, config, stories, Laymos, and package exports contain no obsolete Sync paths or runtime terminology. Historical ADRs that retain old language are explicitly marked superseded.
- The build now removes `dist` before emitting declarations, preventing deleted `tanstack-sync`, change-notice, Source-of-Truth, and Sync Persistence Table artifacts from being packaged after an incremental refactor.
- The rebuilt public declarations expose `createStdSync`, the Sync API, `syncStore`/`SyncStoreLayer`, and `PeerChannel`/`PeerChannelFactory`. They do not expose the default BroadcastChannel adapter, peer codec/envelope, admission state, or private storage records and schemas.
- Both `std-toolkit/sync` and `std-toolkit/sync/paced` resolve through the package export map; no old package export remains.

### Checks Run

- `pnpm --filter std-toolkit lint` — passed; all 459 files formatted, 417 files lint-clean, TypeScript clean, and no Laymos violations.
- `pnpm --filter std-toolkit build` — passed from a clean `dist` and emitted no obsolete declaration paths.
- `pnpm --filter std-toolkit exec vitest run src/sync/runtime/peer-sync/__tests__/peer-sync.test.ts src/sync/__tests__/peer-integration.test.ts` — passed, 2 files and 19 focused Peer Sync tests covering Memory and IndexedDB.
- `pnpm --filter std-toolkit exec vitest run src/sync` — passed, 17 files and 94 Sync tests.
- `pnpm --filter std-toolkit exec vitest run stories/sync/simulation.test.ts` — passed, 1 file and 28 Sync story questions.
- `pnpm --filter std-toolkit stories` — all 28 Sync story questions passed; the package command ended with the expected 31 unrelated DynamoDB-backed story errors because DynamoDB Local is unreachable (`45` stories passed, `31` errored).
- `pnpm --filter std-toolkit test` — all available tests passed (`75` files and `595` tests); the command ended with 16 failures in `src/db/dynamodb/__tests__/dynamodb-conformance.test.ts` because DynamoDB Local at `localhost:8090` is unreachable.
- `pnpm --filter std-toolkit exec node --input-type=module -e "await Promise.all([import('std-toolkit/sync'), import('std-toolkit/sync/paced')])"` — passed.

### Remaining Work

- None in the Sync refactor. Re-run the documented external-service-dependent checks when DynamoDB Local is available.

## Decisions and Discoveries

Append facts learned during implementation that affect later tasks. Do not repeat the settled requirements from `execute.md`.

- The workspace uses `effect@4.0.0-beta.102`, but no `node_modules/effect/AGENTS.md` exists anywhere in the repository.
- Sync Replica accepts a separate qualified storage collection name while validating Entity `_e` against the schema's original name.
- Change-notice channels now use the qualified Collection Name directly; Task 4 can consume the same name when replacing them with Peer Sync.
- Public `applyToSyncReplica` returns only complete entities accepted by convergence, which Task 5 can broadcast directly; internal strategy and registry adapters intentionally discard that result.
- Peer Sync initialization is asynchronous but returns its orchestrator immediately, allowing Collection registration to remain synchronous in Task 5.
- `makePeerSync` passes `{ propagate: false }` to inbound application and drains messages admitted before `close()` while blocking later admission.
- One convergence wrapper in each Collection composition now serves strategies, mutations, manual writes, persisted registry delivery, and peers; optimistic changes and `persist: false` projection bypass it.
- A peer receipt always advances projection after convergence, even when a shared IndexedDB adapter means the sender's committed entity makes the receiver write a no-op.
- Default `BroadcastChannel` is sufficient for the Node story simulator; its Memory tabs no longer share a store layer.
- The story runner executes separate stories concurrently, so a Browser label is not a safe Std Sync Name; the simulation now uses its unique Backend-story flow id as the shared dataset namespace.
- `laymos stories` runs DynamoDB-backed database stories as well as Sync stories and requires a reachable DynamoDB Local service for a complete package pass.
- TypeScript does not remove outputs for deleted source files, so the package build now cleans `dist` before emitting publishable artifacts.

## Blockers

Record the exact failing command, missing dependency, or external requirement and what is needed to continue.

- A complete package-level `pnpm --filter std-toolkit stories` pass requires a
  reachable DynamoDB Local service. The command reports 31 errors in unrelated
  DynamoDB-backed database stories; all 28 Sync story questions pass.
- A complete package-level `pnpm --filter std-toolkit test` pass requires a
  reachable DynamoDB Local service at `localhost:8090`. The command reports 16
  failures in the DynamoDB conformance file; the other 595 tests pass.

## Deviations

Record any necessary departure from `execute.md`, why it was necessary, and its effect on public behavior. Do not silently change the plan.

- The user explicitly overrode the missing `node_modules/effect/AGENTS.md` prerequisite and directed execution to continue using established repository practices. Task 1 changed no Effect behavior.

## Final Verification

- [x] `pnpm --filter std-toolkit lint`
- [x] `pnpm --filter std-toolkit build`
- [x] `pnpm --filter std-toolkit stories` attempted; Sync passed, DynamoDB-dependent stories externally blocked
- [x] `pnpm --filter std-toolkit test` attempted; available tests passed, DynamoDB conformance externally blocked
- [x] Sync-specific Memory and IndexedDB peer tests
- [x] Search for stale public paths and terminology
- [x] Review generated public declarations

## Handoff Notes

At the end of each task:

1. Replace the Current Task details with the next task.
2. Add the completed task's commit hash and check summary to the tracker.
3. Preserve useful discoveries and unresolved blockers.
4. Leave the worktree free of uncommitted task changes; unrelated user changes may remain.

When all tasks are complete, replace Overall Status with `Complete` and summarize any external checks that could not run.
