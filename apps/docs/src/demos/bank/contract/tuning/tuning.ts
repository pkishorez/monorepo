// Every bank-demo tunable in one place. The Sync ones live in std-toolkit's sync/domain/tuning.

/** Accounts per seed burst; each burst is one insert, one openAccounts call, one replica write. */
export const SEED_BURST = 500;

/** Plain inserts run in parallel this wide when the server opens a batch of accounts. */
export const OPEN_CONCURRENCY = 5;

/** Live pushes to subscribers coalesce up to this many rows … */
export const PUSH_BATCH_SIZE = 20;
/** … or this long, whichever comes first. */
export const PUSH_BATCH_WINDOW_MS = 50;

/** Rows per table query while a subscriber catches up from its cursor. */
export const CATCH_UP_PAGE_SIZE = 1000;

/** Accounts per ledger page. */
export const LEDGER_PAGE_SIZE = 20;
