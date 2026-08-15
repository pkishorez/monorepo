import type {
  FlowActivityStatus,
  RecordedFlowActivityLog,
  RecordedFlowAttributeValue,
  RecordedFlowSeverity,
} from './schema.js';

interface FlowObservationBase {
  readonly recordId: string;
  readonly participantName?: string;
  readonly name: string;
  readonly timestamp: number;
  readonly order: string;
  readonly attributes?: Readonly<Record<string, RecordedFlowAttributeValue>>;
}

export interface FlowActivityObservation extends FlowObservationBase {
  readonly source: 'span';
  readonly duration: number | null;
  readonly status: FlowActivityStatus;
  readonly traceId: string;
  readonly spanId: string;
  readonly logs?: readonly RecordedFlowActivityLog[];
}

export interface FlowEventObservation extends FlowObservationBase {
  readonly source: 'log';
  readonly severity: RecordedFlowSeverity;
  readonly itemType?: string;
  readonly activationOutcome?: string;
  readonly destination?: string;
  readonly messageId?: string;
  readonly replyTo?: string;
  readonly state?: Readonly<Record<string, RecordedFlowAttributeValue>>;
}

export type FlowObservation = FlowActivityObservation | FlowEventObservation;

export interface ProjectFlowInput {
  readonly id: string;
  readonly latestTimestamp: number;
  readonly observations: readonly FlowObservation[];
}
