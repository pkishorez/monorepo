import { MessageSquarePlusIcon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';

export function Ask({
  label,
  onAsk,
  className,
}: {
  readonly label: string;
  readonly onAsk: () => void;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Ask about ${label}`}
      title={`Ask about ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onAsk();
      }}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[opacity,color,background-color] duration-150 outline-none group-hover/ask:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:opacity-100',
        className,
      )}
    >
      <MessageSquarePlusIcon aria-hidden className="size-3" />
    </button>
  );
}
