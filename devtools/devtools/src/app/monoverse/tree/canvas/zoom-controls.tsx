import type { ReactNode } from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { HouseIcon, MinusIcon, PlusIcon } from 'lucide-react';

/** The corner buttons: whatever the content adds, zoom out, zoom in, and back to the top at full size. */
export function ZoomControls({
  onOut,
  onIn,
  onHome,
  children,
}: {
  onOut: () => void;
  onIn: () => void;
  onHome: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      data-space-ignore
      className="absolute top-3 right-3 z-10 flex gap-0.5 rounded-lg bg-background/90 p-0.5 shadow-[0_0_0_1px_var(--color-border),0_2px_8px_-2px_rgb(0_0_0/0.15)] backdrop-blur-md"
    >
      {children}
      <Button
        variant="ghost"
        size="icon-sm"
        className="max-sm:size-10"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={onOut}
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="max-sm:size-10"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={onIn}
      >
        <PlusIcon className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="max-sm:size-10"
        aria-label="Back to the top"
        title="Back to the top"
        onClick={onHome}
      >
        <HouseIcon className="size-3.5" />
      </Button>
    </div>
  );
}
