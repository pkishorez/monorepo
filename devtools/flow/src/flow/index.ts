import { make } from './flow.js';

export const Flow = { make } as const;
export {
  Activation,
  type ActivationOutcome,
  type ActivationRef,
  type EntryOptions,
  type Flow as FlowInstance,
  type FlowOptions,
  type MessageToken,
  type Participant,
} from './flow.js';
