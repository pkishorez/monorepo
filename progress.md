# Sync Replica and Peer Sync Refactor Progress

This file is the live handoff for the work defined in `execute.md`. Update it during every task. Keep entries factual and concise; do not mark a task complete until its completion criteria and checks pass.

## Overall Status

- State: In progress
- Current task: Task 7 — Final verification and cleanup
- Next action: Record Task 6's commit hash, then run final stale-language and declaration checks

## Task Tracker

| Task                                                    | Status      | Commit                                   | Checks                                        |
| ------------------------------------------------------- | ----------- | ---------------------------------------- | --------------------------------------------- |
| 1. Establish the `sync` context and package paths       | Complete    | 18adf8cb058070b35cd725f8f7eed72627e22cd7 | Focused tests, lint/TypeScript/Laymos, build  |
| 2. Add names, qualified collection names, and addresses | Complete    | ca0db797aa68c30b7d38a7201b2f89417ec07179 | 104 sync tests, lint/TypeScript/Laymos, build |
| 3. Rename persistence concepts and APIs                 | Complete    | 551a16af58728a3207a0965f3ae958f75da53ec7 | 105 sync tests, lint/TypeScript/Laymos, build |
| 4. Build the Peer Sync deep module                      | Complete    | 340d981eec728eb5639256d77ea57bc7cd75b0e1 | 88 sync tests, lint/TypeScript/Laymos, build  |
| 5. Integrate Peer Sync with replica convergence         | Complete    | c716f963284ef0dfdd2e16ccdf66ca107ef8c562 | 117 sync/story tests, lint/Laymos, build      |
| 6. Finish events, documentation, and stories            | Complete    | —                                        | 28 Sync stories, focused tests, lint/build    |
| 7. Final verification and cleanup                       | Not started | —                                        | —                                             |

Use only these statuses: `Not started`, `In progress`, `Blocked`, `Complete`.

## Current Task

### Scope

Task 7 performs the final stale-language, declaration, and package verification.

### Work Completed

- Task 5 recorded predecessor commit `c716f963284ef0dfdd2e16ccdf66ca107ef8c562`.
- Sync Events now distinguish Peer Sync `send` failures from Registry Broadcast delivery failures; Sync Store and Registry spans/logs use the settled language.
- The Sync glossary is concise domain language, the context map records the Sync Store relationship, and the Sync README explains replica ownership, durability, Peer Sync, Registry Broadcasts, and observability.
- Context-local ADR 0001 records the entity envelope, one-channel-per-Collection, freshness-only, display-address, and no-alias decisions.
- The Peer Sync story covers separate Memory replicas, immediate versus bounded polling delivery, backend repair, independent IndexedDB durability, and disabled-peer convergence.
- Concurrent stories now derive one unique Std Sync Name per simulated Backend dataset, preventing Peer Channels from leaking between unrelated story runs.

### Checks Run

- `pnpm --filter std-toolkit exec vitest run stories/sync/simulation.test.ts` — passed, 1 file and 28 Sync story questions, including all five Peer Sync model scenarios.
- `pnpm --filter std-toolkit exec vitest run src/sync/runtime/peer-sync/__tests__/peer-sync.test.ts src/sync/__tests__/peer-integration.test.ts src/sync/__tests__/registry.test.ts src/sync/composition/keyed-sync/__tests__/flow-tracing.test.ts` — passed, 4 files and 29 focused tests.
- `pnpm --filter std-toolkit stories` — all Sync stories passed after isolating simulated Backend namespaces; the package command ended with 31 unrelated DynamoDB story errors because no DynamoDB Local service is reachable.
- `pnpm --filter std-toolkit lint` — passed; all 459 files formatted, 417 files lint-clean, TypeScript clean, and no Laymos violations.
- `pnpm --filter std-toolkit build` — passed.

### Remaining Work

- Record Task 6's commit hash in the Task 7 commit.
- Run Task 7's full stale-term, declaration, test, and package verification.

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

## Blockers

Record the exact failing command, missing dependency, or external requirement and what is needed to continue.

- A complete package-level `pnpm --filter std-toolkit stories` pass requires a
  reachable DynamoDB Local service. The command currently reports 31 errors in
  unrelated DynamoDB-backed database stories; all Sync stories pass.

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
