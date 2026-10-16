import type { ReactNode } from 'react';

/** Where something is still to be made: an interactive demo, a picture, a code sample. */
export function Placeholder({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
