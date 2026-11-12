import { useEffect, useMemo, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { GraphNode } from '../../../../api/index.ts';
import { Canvas } from './canvas.tsx';
import { allOf, pathTo } from './layout.ts';

/*
 * The Blueprint on the canvas: every Actor the app's root can grow, read
 * from the definitions, whether it runs or not. The cards, the lines and a
 * Capability picked are the canvas's own; what is shown, and what is in
 * the light, is said here, in one of two Forms:
 *
 * 1. Whole   the whole tree, nothing folded. A card pressed is picked:
 *            the way down to it and everything under it stay in the light.
 * 2. Steps   the tree told a level at a time. A card pressed opens what
 *            is under it, and closes what was open beside it; the way down
 *            to it and its Children stay in the light.
 *
 * What is out of the light is dimmed, or hidden. A card pressed again
 * opens; Escape, or the button beside the Forms, lets go of the one picked.
 */

export type Form = 'whole' | 'steps';
export type Off = 'dim' | 'hide';

/** The tree with only the cards `keep` keeps, and the root. */
const pruned = (
  node: GraphNode,
  keep: (one: GraphNode) => boolean,
): GraphNode => ({
  ...node,
  children: node.children.filter(keep).map((child) => pruned(child, keep)),
});

export function Blueprint({
  root,
  opened,
  form,
  off,
  picked,
  onForm,
  onOff,
  onPick,
  onOpen,
}: {
  readonly root: GraphNode;
  /** The cards open, as many as the reader opened. */
  readonly opened: ReadonlyArray<string>;
  readonly form: Form;
  readonly off: Off;
  /** The card picked; null for none. */
  readonly picked: string | null;
  readonly onForm: (form: Form) => void;
  readonly onOff: (off: Off) => void;
  readonly onPick: (id: string | null) => void;
  readonly onOpen: (id: string, open: boolean) => void;
}) {
  const byId = useMemo(
    () => new Map(allOf(root).map((node) => [node.id, node])),
    [root],
  );
  // One picked that the tree no longer has, as after a reload, is let go.
  const card = picked ? byId.get(picked) : undefined;
  const way = useMemo(
    () => new Set(card ? pathTo(root, card.id) : [root.id]),
    [root, card],
  );

  // What is in the light: none in Whole until a card is picked.
  const light = useMemo(() => {
    if (form === 'whole')
      return card
        ? new Set([...way, ...allOf(card).map(({ id }) => id)])
        : undefined;
    return new Set([...way, ...(card ?? root).children.map(({ id }) => id)]);
  }, [form, card, way, root]);

  // Hidden, the cards out of the light are not drawn, unless open.
  const shown = useMemo(() => {
    if (off === 'dim' || !light) return root;
    const kept = new Set(opened.flatMap((id) => pathTo(root, id)));
    return pruned(root, (one) => light.has(one.id) || kept.has(one.id));
  }, [off, light, root, opened]);

  useEffect(() => {
    if (!card) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, onPick]);

  const parentOf = (id: string) => {
    const path = pathTo(root, id);
    return path.at(-2) ?? null;
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Canvas
        root={shown}
        opened={opened}
        cards={new Map()}
        frame
        {...(off === 'dim' && light ? { spotlight: light } : {})}
        unfold={form === 'whole' ? () => true : (node) => way.has(node.id)}
        folding={form === 'steps'}
        selected={card?.id ?? null}
        onSelect={(id) =>
          id === card?.id ? onOpen(id, !opened.includes(id)) : onPick(id)
        }
        // Steps: unfolding a card follows the way down to it; folding one, to its parent.
        onFold={(id, unfold) => onPick(unfold ? id : parentOf(id))}
        onOpen={onOpen}
      />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-2">
        <Choice
          label="How the tree is shown"
          value={form}
          options={[
            { value: 'whole', label: 'Whole tree' },
            { value: 'steps', label: 'Step by step' },
          ]}
          onChange={onForm}
        />
        <Choice
          label="What is out of the light"
          value={off}
          options={[
            { value: 'dim', label: 'Dim' },
            { value: 'hide', label: 'Hide' },
          ]}
          onChange={onOff}
        />
        {card && (
          <button
            type="button"
            onClick={() => onPick(null)}
            title="Let go (Esc)"
            className="pointer-events-auto flex h-8 max-w-56 items-center gap-1.5 rounded-lg border border-border bg-background/90 pr-1.5 pl-2.5 text-xs shadow-xs backdrop-blur transition-colors hover:bg-muted"
          >
            <span className="truncate font-medium">{card.title}</span>
            <XIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="sr-only">Let go of it</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: ReactNode;
  }>;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="pointer-events-auto flex h-8 items-center rounded-lg border border-border bg-background/90 p-0.5 text-xs shadow-xs backdrop-blur"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-full rounded-md px-2.5 transition-colors',
            value === option.value
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
