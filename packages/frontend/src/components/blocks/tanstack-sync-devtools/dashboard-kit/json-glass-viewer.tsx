import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { JsonEditor } from '../../json';

export type JsonGlassViewerProps = {
  value: unknown;
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
};

export function JsonGlassViewer({
  value,
  open,
  onClose,
  title,
}: JsonGlassViewerProps) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(900px,92vw)] max-w-none duration-0 data-closed:animate-none data-open:animate-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{title ?? 'Entity'}</DialogTitle>
        </DialogHeader>
        <JsonEditor value={text} readOnly maxHeight="68vh" />
      </DialogContent>
    </Dialog>
  );
}
