import { Badge } from 'kui-toolkit/components/ui/badge';

export function ManagedStackBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge
      variant="outline"
      aria-label="Alchemy managed stack"
      className={`border-primary/25 bg-primary/10 text-primary ${compact ? 'h-4 px-1.5 text-[10px]' : ''}`}
    >
      {compact ? 'Managed' : 'Alchemy managed'}
    </Badge>
  );
}
