import type {
  RecordedFlowActivation,
  RecordedFlowAttributeValue,
  RecordedFlowItem,
  RecordedFlowWarning,
} from './schema.js';

interface OpenActivation {
  readonly name: string;
  readonly startItemId: string;
  readonly startTimestamp: number;
}

/**
 * Pairs Activation boundaries, merges Participant State forward, and reports
 * what only a whole-Flow scan can see. Both projectors share it so the rules
 * live once.
 */
export const deriveRecordedFlow = (items: readonly RecordedFlowItem[]) => {
  const warnings: RecordedFlowWarning[] = [];
  const activations: RecordedFlowActivation[] = [];
  const open = new Map<string, OpenActivation>();
  const state = new Map<string, Record<string, RecordedFlowAttributeValue>>();
  const emitters = new Set<string>();
  const destinations = new Map<string, string>();

  const close = (
    participantName: string,
    activation: OpenActivation,
    end: Pick<RecordedFlowActivation, 'endItemId' | 'endTimestamp' | 'outcome'>,
  ) => {
    activations.push({ participantName, ...activation, ...end });
    open.delete(participantName);
  };

  const derived = items.map((item): RecordedFlowItem => {
    emitters.add(item.participantName);

    if (item.kind === 'message') {
      destinations.set(item.destination, item.id);
      return item;
    }

    if (item.kind === 'activation-start') {
      const previous = open.get(item.participantName);
      if (previous) {
        warnings.push({
          recordType: 'log',
          recordId: item.id,
          message: `Activation started while "${previous.name}" was still open.`,
        });
        close(item.participantName, previous, {
          endItemId: null,
          endTimestamp: item.timestamp,
          outcome: null,
        });
      }
      open.set(item.participantName, {
        name: item.name,
        startItemId: item.id,
        startTimestamp: item.timestamp,
      });
      return item;
    }

    if (item.kind === 'activation-end') {
      const current = open.get(item.participantName);
      if (!current) {
        warnings.push({
          recordType: 'log',
          recordId: item.id,
          message: 'Activation ended while none was open.',
        });
        return item;
      }
      close(item.participantName, current, {
        endItemId: item.id,
        endTimestamp: item.timestamp,
        outcome: item.outcome,
      });
      return item;
    }

    if (item.kind === 'state') {
      const merged = { ...state.get(item.participantName) };
      for (const [key, value] of Object.entries(item.state)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      state.set(item.participantName, merged);
      return { ...item, merged };
    }

    return item;
  });

  for (const [participantName, activation] of open) {
    activations.push({
      participantName,
      ...activation,
      endItemId: null,
      endTimestamp: null,
      outcome: null,
    });
  }

  for (const [destination, recordId] of destinations) {
    if (emitters.has(destination)) continue;
    warnings.push({
      recordType: 'log',
      recordId,
      message: `Message sent to "${destination}", which records nothing in this Flow.`,
    });
  }

  activations.sort((left, right) => left.startTimestamp - right.startTimestamp);

  return { activations, items: derived, warnings };
};
