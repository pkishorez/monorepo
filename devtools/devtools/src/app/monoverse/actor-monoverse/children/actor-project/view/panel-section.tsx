import type { ReactNode } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';

export function PanelSection({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col gap-1', className)}
    >
      <h2 className="px-2 pt-1 text-[11px] font-medium text-muted-foreground select-none">
        {title}
      </h2>
      {children}
    </section>
  );
}
