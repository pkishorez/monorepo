import { Braces, Database } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import type { PresentedField } from '../relationship-presentation';
import { ComplexTypeTree } from './complex-type-tree';

export function ComplexFieldDetails({
  entityLabel,
  field,
  onOpenChange,
}: {
  readonly entityLabel: string;
  readonly field?: PresentedField;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const open = field?.complex !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] w-[min(540px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {field?.complex !== undefined && (
          <>
            <DialogHeader className="shrink-0 border-b border-border/70 bg-muted/20 px-4 py-3.5 pe-14">
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/[0.07] text-primary">
                  <Braces className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
                    <Database className="size-3" aria-hidden />
                    <span className="truncate">{entityLabel}</span>
                    <span aria-hidden>/</span>
                    <span className="truncate font-mono">{field.name}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <DialogTitle className="truncate text-sm font-semibold tracking-tight">
                      {field.name}
                    </DialogTitle>
                    <span className="shrink-0 rounded-md border border-border/70 bg-background/70 px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                      {field.type}
                    </span>
                  </div>
                  <DialogDescription className="sr-only">
                    Structure and references contained by this field.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div
              aria-label={`${field.name} schema structure`}
              className="min-h-0 flex-1 overflow-y-auto bg-background p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
              role="region"
              tabIndex={0}
            >
              <ComplexTypeTree complex={field.complex} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
