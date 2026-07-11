import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import type { InspectorPartition } from '../view-model';

export type RequestPartitionTarget = {
  collectionName: string;
  field: string;
};

function buildPartition(
  collectionName: string,
  field: string,
  value: string,
): InspectorPartition {
  return {
    id: `${collectionName}:${field}=${value}`,
    collectionName,
    partitionField: field,
    partitionValue: value,
    partitionKey: `${field}="${value}"`,
    partitionKind: 'partition',
    activity: 'cached',
    itemCount: 0,
    subscriberCount: 0,
    strategyState: { strategy: 'oldToNew', cursor: null },
  };
}

export function RequestPartitionDialog({
  target,
  onClose,
  onRequest,
}: {
  target: RequestPartitionTarget | null;
  onClose: () => void;
  onRequest: (partition: InspectorPartition) => void;
}) {
  const [value, setValue] = useState('');

  const submit = () => {
    if (!target) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onRequest(buildPartition(target.collectionName, target.field, trimmed));
    setValue('');
    onClose();
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) {
          setValue('');
          onClose();
        }
      }}
    >
      <DialogContent className="w-[min(420px,92vw)] duration-0 data-closed:animate-none data-open:animate-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            Request partition
            <span className="text-muted-foreground font-mono text-xs">
              {target?.field}
            </span>
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partition-value" className="text-xs">
              {target?.field} value
            </Label>
            <Input
              id="partition-value"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Enter ${target?.field ?? 'partition'} value`}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setValue('');
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!value.trim()}>
              Open partition
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
