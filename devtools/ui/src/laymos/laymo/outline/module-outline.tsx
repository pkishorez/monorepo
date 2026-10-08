import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChangeStatus } from 'laymos';

import { ChevronRight } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

import { lookIcons, lookOf } from '../cards/laymo-card';
import { pathTo, type LaymoNode, type LaymoTree } from '../laymo-tree';

/**
 * The Module outline: the same cards as the Laymo, as a tree that stops at
 * Modules. A row is pressed like its card; right-click lists its files. The
 * selected row is revealed and scrolled to, and the rows a selection lights
 * are tinted. A dot says what changed: green added, yellow modified, red
 * deleted. A double-click opens the row as its card does.
 */
export function ModuleOutline({
  tree,
  selectedKey,
  litKeys,
  changeStatusOf,
  onPress,
  onOpenFiles,
  onOpen,
  badgesOf,
  label = 'Module outline',
}: {
  readonly tree: LaymoTree;
  readonly selectedKey: string | undefined;
  readonly litKeys: ReadonlySet<string> | undefined;
  readonly changeStatusOf: (card: LaymoNode) => ChangeStatus | undefined;
  readonly onPress: (key: string) => void;
  readonly onOpenFiles: (card: LaymoNode) => void;
  readonly onOpen?: ((card: LaymoNode) => void) | undefined;
  readonly badgesOf?: ((card: LaymoNode) => ReactNode) | undefined;
  readonly label?: string;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(tree.root.children.map((card) => card.key)),
  );
  const rows = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (selectedKey === undefined) return;
    const above = pathTo(tree, selectedKey).slice(0, -1);
    setExpanded((current) =>
      above.every((card) => current.has(card.key))
        ? current
        : new Set([...current, ...above.map((card) => card.key)]),
    );
  }, [tree, selectedKey]);
  useEffect(() => {
    if (selectedKey === undefined) return;
    rows.current.get(selectedKey)?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey, expanded]);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const row = (card: LaymoNode, depth: number): ReactNode => {
    const look = lookOf(card);
    const Icon = lookIcons[look];
    const holds = card.children.length > 0;
    const isOpen = expanded.has(card.key);
    const selected = selectedKey === card.key;
    const lit = !selected && litKeys?.has(card.key) === true;
    const status = card.deleted ? 'deleted' : changeStatusOf(card);
    return (
      <li key={card.key}>
        <div
          ref={(element) => {
            if (element === null) rows.current.delete(card.key);
            else rows.current.set(card.key, element);
          }}
          role="treeitem"
          aria-selected={selected}
          aria-expanded={holds ? isOpen : undefined}
          onClick={() => onPress(card.key)}
          onDoubleClick={onOpen === undefined ? undefined : () => onOpen(card)}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenFiles(card);
          }}
          style={{ paddingInlineStart: `${depth * 14 + 4}px` }}
          className={cn(
            'flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-md pe-2 text-[13px] transition-colors',
            selected
              ? 'bg-foreground/12 font-medium text-foreground'
              : lit
                ? 'bg-foreground/[0.05] text-foreground'
                : 'hover:bg-muted',
          )}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            disabled={!holds}
            onClick={(event) => {
              event.stopPropagation();
              toggle(card.key);
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:invisible"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform',
                isOpen && 'rotate-90',
              )}
            />
          </button>
          <Icon
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate" title={card.title}>
            {card.title}
          </span>
          {badgesOf?.(card)}
          {status !== undefined && (
            <span
              aria-label={status}
              title={status}
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                status === 'added'
                  ? 'bg-green-500'
                  : status === 'deleted'
                    ? 'bg-red-500'
                    : 'bg-yellow-500',
              )}
            />
          )}
        </div>
        {holds && isOpen && (
          <ul role="group">
            {card.children.map((child) => row(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label={label} className="flex flex-col gap-px p-1.5">
      {tree.root.children.map((card) => row(card, 0))}
    </ul>
  );
}
