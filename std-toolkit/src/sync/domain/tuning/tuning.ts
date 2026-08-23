// Every Sync tunable in one place. Change, rebuild, measure.

/** Rows per Sync Replica read during hydration; each page is projected before the next is read. */
export const HYDRATION_PAGE_SIZE = 1000;

/** Hydration always projects page by page; this decides when the Collection is marked ready — after the first projected page, or only once every stored row is in. TODO: per-collection config. */
export const READY_AFTER_FIRST_PAGE = false;

/** Ops per Sync Store transaction when writing to the Sync Replica (DynamoDB's cap). */
export const REPLICA_TRANSACT_LIMIT = 100;

/** Current-row reads in flight while preparing a Sync Replica write. */
export const REPLICA_READ_CONCURRENCY = 12;

/** Per-item onUpdate / onDelete callbacks of one transaction run this many at a time. */
export const MUTATION_CONCURRENCY = 5;
