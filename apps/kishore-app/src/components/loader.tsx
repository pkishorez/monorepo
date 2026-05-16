import { cn } from '@monorepo/frontend/utils';

export function Skeleton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(className, 'animate-pulse bg-foreground/30 rounded-sm')}>
      <div className="opacity-0">{children}</div>
    </div>
  );
}
