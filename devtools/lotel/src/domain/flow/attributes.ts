import {
  flowAttributes,
  isTerminalFlowStatus,
  type TerminalFlowStatus,
} from '@pkishorez/effect-tracer/flow';
import type { KeyValue } from '../telemetry-schema/index.js';

export const readFlowAttribute = (
  attributes: KeyValue[] | undefined,
  key: keyof typeof flowAttributes,
) => {
  const value = attributes?.find(
    (attribute) => attribute.key === flowAttributes[key],
  )?.value?.stringValue;
  return value && value.length > 0 ? value : undefined;
};

export const readFlowIdentity = (attributes: KeyValue[] | undefined) => ({
  flowId: readFlowAttribute(attributes, 'id') ?? null,
  participantName: readFlowAttribute(attributes, 'participantName') ?? null,
});

export const readTerminalStatus = (
  attributes: KeyValue[] | undefined,
): TerminalFlowStatus | undefined => {
  const status = readFlowAttribute(attributes, 'status');
  return isTerminalFlowStatus(status) ? status : undefined;
};
