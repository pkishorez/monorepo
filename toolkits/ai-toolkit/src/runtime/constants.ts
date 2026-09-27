// Undecided operational values live here until a real consumer decides them.

/** Streaming text is persisted as soon as its buffer reaches this size. */
export const FLUSH_MIN_CHARS = 250;

/** Identity the Harness Host writes onto every Run it starts. */
export const HOST_ID = 'ai-toolkit-host';

/** A Run that has not ended by this deadline is cancelled. */
export const RUN_TIMEOUT_MS = 3_600_000;

/** Default deadline for an Interaction Request before a negative Resolution. */
export const INTERACTION_TIMEOUT_MS = 300_000;

/** Executable used to spawn the Codex app-server. */
export const CODEX_COMMAND = 'codex';

/** Working directory given to every Thread the playground creates. */
export const THREAD_CWD = process.cwd();

/** Loopback address and default port of the Playground Server. */
export const PLAYGROUND_HOST = '127.0.0.1';
export const PLAYGROUND_PORT = 3001;

/** Page size used when the playground catches a subscriber up from a cursor. */
export const SYNC_PAGE_SIZE = 100;
