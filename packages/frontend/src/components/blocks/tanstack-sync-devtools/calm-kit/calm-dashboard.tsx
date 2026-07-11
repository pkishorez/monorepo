import { useState } from 'react';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { DatabaseIcon } from '#lib/lucide';
import { useTanStackSyncDevtools } from '../internal/context';
import type { InspectorData, InspectorPartition } from '../view-model';
import { IdbDashboard } from '../idb-kit';
import { resolveCollection } from './collection-state';
import { CalmEntriesModal } from './calm-entries-modal';
import { MasterDetail } from './master-detail';

export function CalmDashboard({
  data,
  active = true,
}: {
  data: InspectorData;
  active?: boolean;
}) {
  const { inspector } = useTanStackSyncDevtools();
  const [selected, setSelected] = useState<InspectorPartition | null>(null);
  const [idbOpen, setIdbOpen] = useState(false);
  const storageTitle =
    inspector.storage.descriptor.kind === 'memory'
      ? 'In-memory storage'
      : 'IndexedDB';

  // `selected` is the partition captured at click time; resolve it back to its
  // live counterpart each render so the modal's strategy visualization (slices,
  // counts) stays live. Resolve against the same resolved collections the cards
  // use — not raw `data.partitions` — so the synthetic "total sync" row (absent
  // from `data.partitions` for non-partitioned collections) also stays live.
  // Match by content, since a requested or synthetic partition carries an id that
  // never equals the inspector's `partitionIdOf`. Fall back to the snapshot when
  // no resident row exists yet.
  const livePartition = selected
    ? (data.collections
        .flatMap(
          (collection) =>
            resolveCollection(
              collection,
              data.partitions,
              data.sotCounts[collection.collectionName] ?? 0,
            ).partitions,
        )
        .find(
          (p) =>
            p.id === selected.id ||
            (p.collectionName === selected.collectionName &&
              p.partitionField === selected.partitionField &&
              p.partitionValue === selected.partitionValue),
        ) ?? selected)
    : null;

  return (
    <div className="relative h-full min-h-0">
      <MasterDetail data={data} onSelectPartition={setSelected} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIdbOpen(true)}
        className="bg-popover absolute right-3 bottom-3 z-10 h-7 gap-1.5 text-xs shadow-sm"
      >
        <DatabaseIcon className="size-3.5" />
        Storage
      </Button>

      <CalmEntriesModal
        active={active}
        data={data}
        partition={livePartition}
        onClose={() => setSelected(null)}
      />

      <Dialog open={idbOpen} onOpenChange={setIdbOpen}>
        <DialogContent className="flex max-h-[85vh] w-[min(960px,92vw)] max-w-none flex-col overflow-hidden duration-0 data-closed:animate-none data-open:animate-none sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{storageTitle}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <IdbDashboard active={idbOpen} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
