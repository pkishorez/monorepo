import { PartitionEntriesModal } from '../dashboard-kit';
import type { CalmEntriesModalProps } from './types';

export function CalmEntriesModal({
  active = true,
  data,
  partition,
  onClose,
}: CalmEntriesModalProps) {
  return (
    <PartitionEntriesModal
      active={active}
      data={data}
      partition={partition}
      onClose={onClose}
    />
  );
}
