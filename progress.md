# Local Database Adapter Refactor

## Goal

Restructure SQLite and IndexedDB into adapter-local deep modules aligned with DynamoDB's dependency direction, while introducing database-scoped runtimes and shared persistence errors.

## Progress

- [x] Architecture brainstorming and terminology decisions
- [x] Local database runtime ADR
- [x] Baseline verification
- [x] Shared persistence error module
- [x] DynamoDB shared-error migration
- [x] SQLite deep-module refactor
- [x] IndexedDB deep-module refactor
- [x] Public conformance and export cleanup
- [x] README and architecture documentation updates
- [x] Full formatting, type-check, build, and test verification

## Decisions

- SQLite and IndexedDB implementations remain adapter-local.
- Local runtimes are database-scoped; table definitions own physical table/store names.
- Native clients are thin and internal; public layer construction remains one step.
- Raw table CRUD is private; runtime service types remain publicly nameable because public Effect signatures depend on them.
- Shared persistence failures use common tagged classes and normalized payloads.
- SQLite is refactored before IndexedDB.
- Existing engine-specific behavior is preserved unless explicitly agreed otherwise.

## Current Work

Complete. SQLite and IndexedDB now use database-scoped runtimes and real deep entity modules without DynamoDB's logical-name machinery.

## Completed Implementation

- SQLite layers are database-scoped; `SQLiteTable.make(tableName)` owns the real table name.
- IndexedDB layers are database-scoped; `IdbTable.make(storeName)` owns the real object-store name.
- Local table orchestrators expose entity operations, setup, snapshots, transactions, and explicit administrative cleanup while raw row operations stay private.
- SQLite and IndexedDB entity implementations return factory-composed immutable service objects rather than public class instances.
- Shared semantic persistence failures are reused by DynamoDB, SQLite, and IndexedDB.
- SQLite's Effect runtime and transaction types are publicly nameable so downstream declaration builds remain portable; native client construction stays adapter-owned.
- Migrated Lotel and Whatever Code to database-scoped SQLite layers and physical table names.
- Restored `dangerouslyRemoveAllItems` as an explicit administrative table capability used by downstream cleanup workflows.
- Foreign transaction items and duplicate transaction targets are typed failures across local adapters.
- IndexedDB setup supports multiple stores sharing one database runtime and concurrent version convergence.
- Package exports no longer expose the IndexedDB internal source tree.
- Adapter layer graphs have no violations, and both local service dependency cycles were removed.
- Removed shallow read/mutation binder modules; public capability selection now lives directly in each entity composition point.
- Split keyed and single-entity services into real builder, context/index, reader, writer, and transaction capabilities; named modules are now small composition roots.
- Verified that no shallow `.bind` capability wrappers or local logical table/store aliases remain.

## Verification

- `vp check`: clean, no warnings
- `tsc`: clean
- `tsc -p tsconfig.build.json`: clean
- `vitest run`: 59 files passed, 775 tests passed, 1 todo
- Recursive workspace tests: all 82 test files passed, 891 tests passed, 1 todo
- Recursive workspace build: all 10 build targets passed, including docs prerender
- Recursive workspace formatting, Syncpack, and TypeScript checks: clean
- `laymos lint`: no layer violations and no SQLite/IndexedDB module cycles; 41 pre-existing violations remain in ESchema, snapshot, and TanStack Sync (baseline was 53)

## Risks and Follow-ups

- Package export changes are intentionally breaking and are documented in the adapter READMEs.
- The 41 remaining Laymos findings are outside this refactor in ESchema, snapshot, and TanStack Sync.
