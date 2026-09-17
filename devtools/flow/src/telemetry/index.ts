import { layerMemory, makeMemoryFlowTelemetry } from './memory.js';
import { layer } from './remote.js';
import { FlowTelemetry as FlowTelemetryReference } from './telemetry.js';

/**
 * Flow Telemetry: the optional sink every Flow in a runtime writes to.
 *
 * - `FlowTelemetry.layer({ endpoint })` forwards Entries to a Flow Store.
 * - `FlowTelemetry.layerMemory()` keeps them in memory for tests and Stories.
 * - Without either, Entries are discarded.
 */
export const FlowTelemetry = Object.assign(FlowTelemetryReference, {
  layer,
  layerMemory,
  makeMemory: makeMemoryFlowTelemetry,
});

export type {
  FlowTelemetryService,
  MemoryFlowTelemetry,
  NoneFlowTelemetry,
  RemoteFlowTelemetry,
} from './telemetry.js';
export type { MemoryFlowTelemetryOptions } from './memory.js';
export type { RemoteFlowTelemetryOptions } from './remote.js';
