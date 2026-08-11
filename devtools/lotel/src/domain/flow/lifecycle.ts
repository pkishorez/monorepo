import type {
  RecordedFlow,
  TerminalFlowStatus,
} from '@pkishorez/effect-tracer/flow';

interface FlowState {
  readonly flowId: string;
  readonly latestTimeUnixNano: string;
  readonly status: RecordedFlow['status'];
}

const compareTime = (left: string, right: string) => {
  try {
    const leftTime = BigInt(left);
    const rightTime = BigInt(right);
    return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
};

export const advanceFlow = (
  flowId: string,
  time: string,
  status: TerminalFlowStatus | undefined,
  current?: FlowState,
): FlowState => ({
  flowId,
  latestTimeUnixNano:
    current && compareTime(current.latestTimeUnixNano, time) > 0
      ? current.latestTimeUnixNano
      : time,
  status:
    current && current.status !== 'active'
      ? current.status
      : (status ?? current?.status ?? 'active'),
});
