import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#components/ui/accordion';
import { Badge } from '#components/ui/badge';
import { cn } from '#lib/utils';
import { collectionAccent, statusTone } from './colors';
import type { CollectionAccordionProps } from './types';

export function CollectionAccordion({
  collection,
  activeCount,
  inactiveCount,
  children,
  defaultOpen = false,
  dimmed = false,
  className,
}: CollectionAccordionProps) {
  const accent = collectionAccent(collection.collectionName);
  const tone = statusTone(collection.status);

  return (
    <Accordion
      defaultValue={defaultOpen ? ['item'] : []}
      className={cn(
        'overflow-hidden rounded-xl border border-white/10',
        dimmed && 'opacity-55',
        className,
      )}
      style={{
        backgroundColor: accent.surface,
        borderLeft: `2px solid ${accent.border}`,
      }}
    >
      <AccordionItem value="item" className="border-b-0">
        <AccordionTrigger className="px-3 py-2.5 hover:no-underline">
          <span className="flex flex-1 flex-wrap items-center gap-2">
            <span
              className="text-sm font-semibold"
              style={{ color: accent.text }}
            >
              {collection.collectionName}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {collection.kind}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[10px]"
              style={{ backgroundColor: tone.bg, color: tone.fg }}
            >
              {collection.status}
            </Badge>
            <span className="text-muted-foreground ml-auto pr-2 text-xs tabular-nums">
              {collection.itemCount} items · {activeCount} active ·{' '}
              {inactiveCount} idle · {collection.subscriberCount} subs
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-3 pb-3">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
