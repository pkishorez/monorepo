import { ChevronUpIcon, Maximize2Icon } from 'lucide-react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { kindOf, whereOf } from './tree.ts';
import type { Exists, Node } from './tree.ts';

/** One per key draws as a stack, and may be absent draws dashed. */
const shapeOf = (exists: Exists): CSSProperties =>
  exists.how === 'each'
    ? {
        boxShadow:
          '5px 5px 0 -1px var(--background), 5px 5px 0 0 var(--border), 10px 10px 0 -1px var(--background), 10px 10px 0 0 var(--border)',
      }
    : exists.how === 'while'
      ? { borderStyle: 'dashed' }
      : {};

const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

/** How it exists under its parent: when, and in which of its parent's States. */
export const whenOf = (node: Node): string =>
  [
    whereOf(node.exists),
    node.onlyIn ? `only in ${node.onlyIn.join(', ')}` : null,
    kindOf(node),
  ]
    .filter(Boolean)
    .join(' · ');

/*
 * One Actor on the map. Clicking it unfolds its Children, or, with none to
 * unfold, explains it. Far away, only its name is drawn, as on any map.
 */
export function Card({
  node,
  open,
  here,
  far,
  onClick,
  onExplain,
  onKeyDown,
  onFocus,
}: {
  node: Node;
  open: boolean;
  here: boolean;
  far: boolean;
  onClick: () => void;
  onExplain: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
}) {
  const count = node.children.length;
  const facts = [
    node.states.length ? plural(node.states.length, 'State') : null,
    node.gives.length ? `gives ${node.gives.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const when = whenOf(node);
  return (
    <div
      style={shapeOf(node.exists)}
      className={`relative size-full rounded-xl bg-card transition-[border-color] duration-150 ${far ? 'border-[5px]' : 'border'} ${
        here
          ? 'border-foreground/70'
          : 'border-border hover:border-foreground/30'
      }`}
    >
      <button
        type="button"
        data-card={node.id}
        aria-expanded={count > 0 ? open : undefined}
        aria-label={`${node.name}. ${node.says}${
          count > 0
            ? ` ${plural(count, 'part')}, ${open ? 'unfolded' : 'folded'}.`
            : ''
        }`}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className="relative flex size-full cursor-pointer touch-manipulation flex-col rounded-xl p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50"
      >
        {far ? (
          <span className="m-auto text-center text-5xl leading-tight font-semibold tracking-tight">
            {node.name}
          </span>
        ) : (
          <>
            <span className="truncate pr-7 text-xs text-muted-foreground">
              {node.question}
            </span>
            <span className="mt-1 truncate text-lg leading-tight font-semibold tracking-tight">
              {node.name}
            </span>
            <span className="mt-1.5 line-clamp-3 text-[13px] leading-[1.4] text-pretty">
              {node.says}
            </span>
            <span className="mt-auto flex flex-col gap-0.5 pt-1 text-[11px] leading-tight text-muted-foreground">
              {when && <span className="truncate">{when}</span>}
              {facts && <span className="tabular-nums">{facts}</span>}
            </span>
          </>
        )}
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -bottom-3 left-1/2 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background px-1.5 text-xs font-medium tabular-nums"
          >
            {open ? <ChevronUpIcon className="size-3.5" /> : count}
          </span>
        )}
      </button>
      {!far && (
        <button
          type="button"
          aria-label={`Explain ${node.name}`}
          title="Explain"
          onClick={onExplain}
          className="absolute top-1.5 right-1.5 flex size-7 cursor-pointer touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 before:absolute before:-inset-1 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground/50"
        >
          <Maximize2Icon aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}
