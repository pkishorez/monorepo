import type {
  InspectorData,
  InspectorPartition,
  InspectorStrategyState,
} from '../view-model';

export type CalmStrategyVizProps = {
  strategyState: InspectorStrategyState;
  partition: InspectorPartition;
  hideCaption?: boolean;
  className?: string;
};

export type CalmEntriesModalProps = {
  active?: boolean;
  data: InspectorData;
  partition: InspectorPartition | null;
  onClose: () => void;
};
