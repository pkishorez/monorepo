import { Badge } from '@kestack/web-platform/components/badge';

/** Says a toolkit or a page is not written yet. */
export function SoonBadge({ className }: { readonly className?: string }) {
  return (
    <Badge
      variant="outline"
      className={`h-4 px-1.5 text-[10px] font-normal text-muted-foreground ${className ?? ''}`}
    >
      Soon
    </Badge>
  );
}
