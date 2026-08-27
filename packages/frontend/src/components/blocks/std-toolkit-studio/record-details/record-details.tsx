import { JsonViewer } from '../../json';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

export function RecordDetails({
  record,
  onOpenChange,
}: {
  readonly record: unknown;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={record !== undefined} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(860px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Record details</DialogTitle>
          <DialogDescription>
            Complete encoded value and entity metadata. This view is read-only.
          </DialogDescription>
        </DialogHeader>
        <JsonViewer value={record} label="Encoded record" maxHeight="68vh" />
      </DialogContent>
    </Dialog>
  );
}
