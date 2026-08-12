export const flowAttributes = {
  id: 'flow.id',
  itemType: 'flow.item.type',
  messageTo: 'flow.message.to',
  participantName: 'flow.participant.name',
  status: 'flow.status',
} as const;

/** Namespace for user-defined attributes attached directly to Flow logs. */
export const flowAttributePrefix = 'flowattr.' as const;

export const flowItemTypes = {
  localEvent: 'local-event',
  message: 'message',
} as const;

export const flowStatuses = [
  'active',
  'cancelled',
  'completed',
  'failed',
] as const;

export const terminalFlowStatuses = [
  'cancelled',
  'completed',
  'failed',
] as const;

export type FlowStatus = (typeof flowStatuses)[number];
export type TerminalFlowStatus = (typeof terminalFlowStatuses)[number];
export type FlowActivityStatus = 'error' | 'running' | 'success' | 'unset';
export type RecordedFlowStatus = FlowStatus;
export type RecordedFlowSeverity = 'debug' | 'error' | 'info' | 'warning';

interface RecordedFlowItemBase {
  readonly id: string;
  readonly participantName: string;
  readonly name: string;
  /** Milliseconds since the epoch. */
  readonly timestamp: number;
}

export interface RecordedFlowActivity extends RecordedFlowItemBase {
  readonly kind: 'activity';
  /** Activity duration in milliseconds, or null while it is running. */
  readonly duration: number | null;
  readonly status: FlowActivityStatus;
  readonly traceId: string;
  readonly spanId: string;
}

export interface RecordedFlowLocalEvent extends RecordedFlowItemBase {
  readonly kind: 'local-event';
  readonly severity: RecordedFlowSeverity;
  readonly status?: TerminalFlowStatus;
}

export interface RecordedFlowMessage extends RecordedFlowItemBase {
  readonly kind: 'message';
  readonly severity: RecordedFlowSeverity;
  readonly destination: string;
}

export type RecordedFlowItem =
  | RecordedFlowActivity
  | RecordedFlowLocalEvent
  | RecordedFlowMessage;

export interface RecordedFlowWarning {
  readonly recordType: 'log' | 'span';
  readonly recordId: string;
  readonly message: string;
}

export interface RecordedFlow {
  readonly id: string;
  readonly status: RecordedFlowStatus;
  readonly latestTimestamp: number;
  readonly items: readonly RecordedFlowItem[];
  readonly warnings: readonly RecordedFlowWarning[];
}

export const isTerminalFlowStatus = (
  value: unknown,
): value is TerminalFlowStatus =>
  terminalFlowStatuses.some((status) => status === value);
