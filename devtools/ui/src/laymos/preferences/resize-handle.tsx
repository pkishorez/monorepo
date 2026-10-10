import { cn } from '@kstackz/web-platform/components/utils';

/**
 * A vertical edge to drag a panel's width by, desktop only. It reports the
 * pointer's x on the screen as it moves; the panel works out its width.
 */
export function ResizeHandle({
  label,
  onMove,
  className,
}: {
  readonly label: string;
  readonly onMove: (clientX: number) => void;
  readonly className?: string | undefined;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      data-space-ignore
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const move = (moved: PointerEvent) => onMove(moved.clientX);
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.style.removeProperty('cursor');
          document.body.style.removeProperty('user-select');
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      className={cn(
        'absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-foreground/15 active:bg-foreground/25 max-sm:hidden',
        className,
      )}
    />
  );
}
