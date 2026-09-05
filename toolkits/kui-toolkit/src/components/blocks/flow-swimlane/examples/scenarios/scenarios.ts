import type { Effect } from 'effect';
import { commerceScenarios } from './commerce';
import { communicationScenarios } from './communication';
import { operationScenarios } from './operations';

export interface FlowScenario {
  readonly id: string;
  readonly title: string;
  readonly program: () => Effect.Effect<void>;
}

export const flowScenarios: readonly FlowScenario[] = [
  ...communicationScenarios,
  ...commerceScenarios,
  ...operationScenarios,
];
