// The run entity schema the db persists.
export { RunSchema } from './run.js';
// Callers hand a configuration over the wire; this normalizes it for persistence.
export { toPersistedConfiguration } from './run.js';
// Contract, orchestrators, and harness annotate the configurations they accept.
export type { RunConfigurationInput } from './run.js';
// Orchestrators derive a run's terminal status + details from its outcome.
export { deriveRunTerminal } from './run.js';
