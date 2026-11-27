import type { ComponentType, ReactNode } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { ChevronDownIcon } from 'lucide-react';

export const crumbTrigger = cn(
  'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium text-foreground transition-colors duration-150 outline-none select-none max-sm:h-10',
  'hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-muted/70',
);

export function CrumbLabel({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  children: ReactNode;
}) {
  return (
    <>
      <Icon
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground max-sm:hidden"
      />
      <span className="truncate">{children}</span>
      <ChevronDownIcon
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground"
      />
    </>
  );
}
