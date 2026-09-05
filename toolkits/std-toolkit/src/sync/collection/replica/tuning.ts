// Every Sync tunable in one place. Change, rebuild, measure.

/** Rows per Sync Replica read during hydration; each page is projected before the next is read. */
export const HYDRATION_PAGE_SIZE = 1000;

/** Ops per Sync Store transaction when writing to the Sync Replica (DynamoDB's cap). */
export const REPLICA_TRANSACT_LIMIT = 100;

/** Current-row reads in flight while preparing a Sync Replica write. */
export const REPLICA_READ_CONCURRENCY = 12;
