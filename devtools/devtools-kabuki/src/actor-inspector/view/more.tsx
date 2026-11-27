import { ListFilterIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import type { Card, More } from '../logic/shared/index.ts';
import { Picker } from './picker.tsx';

const nameOf = (card: Card) =>
  card.node.key === undefined || card.node.key === '[]'
    ? (card.type ?? card.name)
    : `${card.type ?? card.name} [${card.node.key}]`;

export function MoreCard({
  more,
  picked,
  onPick,
  onOpen,
}: {
  readonly more: More;
  readonly picked: ReadonlySet<string>;
  readonly onPick: (address: string) => void;
  readonly onOpen: () => void;
}) {
  const hidden = new Set(more.hidden.map(({ node }) => node.address));
  const listed = more.all.filter(
    ({ node }) => hidden.has(node.address) || picked.has(node.address),
  );
  const kind = more.all[0]?.name ?? 'children';
  return (
    <article
      data-body
      className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border bg-card/70 px-3 py-2.5 text-[12.5px] leading-5"
    >
      <div className="flex flex-col">
        <p className="text-sm font-semibold tabular-nums">
          {more.open
            ? `All ${more.total} ${kind}`
            : `${more.hidden.length} more ${kind}`}
        </p>
        <p className="text-xs text-pretty text-muted-foreground">
          {more.open
            ? 'Every one is on the Board.'
            : `${more.total - more.hidden.length} of ${more.total} shown${more.touched > 0 ? `; ${more.touched} hidden ones changed in this Step` : ''}. Pick one to put it on the Board.`}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {!more.open && listed.length > 0 && (
          <Picker
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
              />
            }
            label={
              <>
                <ListFilterIcon aria-hidden className="size-3.5" />
                Pick
              </>
            }
            placeholder={`Find a ${kind} by key or State`}
            items={listed.map((card) => ({
              id: card.node.address,
              name: nameOf(card),
              hint: card.added
                ? 'new'
                : card.ghost
                  ? 'removed'
                  : card.changed
                    ? 'changed'
                    : card.node.state,
              checked: picked.has(card.node.address),
            }))}
            onPick={onPick}
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpen}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          {more.open ? 'Show fewer' : `Show all ${more.total}`}
        </Button>
      </div>
    </article>
  );
}
