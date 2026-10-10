import type { PointerEvent } from 'react';

type Card = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
};

/**
 * One card. `held` draws it as the card being dragged, where it would land.
 * `marks` are the drag module's data attributes; `onPickUp` starts a drag.
 */
export const CardTile = ({
  card,
  held = false,
  marks,
  onPickUp,
}: {
  readonly card: Card;
  readonly held?: boolean;
  readonly marks: Readonly<Record<string, string>>;
  readonly onPickUp?: () => void;
}) => (
  <li
    {...marks}
    className={`touch-none rounded-lg border bg-background p-3 text-sm shadow-xs select-none ${
      held
        ? 'border-primary ring-2 ring-primary/30'
        : onPickUp
          ? 'cursor-grab hover:border-foreground/30'
          : ''
    }`}
    onPointerDown={(event: PointerEvent) => {
      if (event.button !== 0 || !onPickUp) return;
      event.preventDefault();
      onPickUp();
    }}
  >
    <p className="font-medium">{card.title}</p>
    {card.description && (
      <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
    )}
  </li>
);
