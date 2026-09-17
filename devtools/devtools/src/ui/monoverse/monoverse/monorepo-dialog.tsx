import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { MonorepoManager } from './monorepo-manager';

export function MonorepoDialog({
  open,
  onOpenChange,
  onSelected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelected: (path: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Navigate to monorepo</DialogTitle>
          <DialogDescription>
            Pick a monorepo by its absolute root path, or add a new one.
          </DialogDescription>
        </DialogHeader>
        <MonorepoManager
          onSelected={(path) => {
            onOpenChange(false);
            onSelected(path);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
