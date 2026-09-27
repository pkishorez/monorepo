import type { ReactNode } from 'react';

import { cn } from '#lib/utils';

interface FixtureFrameProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function FixtureFrame({ children, className }: FixtureFrameProps) {
  return (
    <div className={cn('min-h-screen bg-background p-6', className)}>
      {children}
    </div>
  );
}

export function FixtureControls({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>
  );
}

export function FixtureButton({
  active = false,
  children,
  onClick,
}: {
  readonly active?: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-muted',
        active && 'border-primary bg-primary/10 text-primary',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
