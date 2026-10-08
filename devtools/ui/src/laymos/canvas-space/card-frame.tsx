import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { motion, useTransform } from 'motion/react';

import { cn } from '@kstackz/web-platform/components/utils';

import type { Size } from './geometry';
import type { CardValues } from './use-card-motion';

/**
 * Where one card sits in the space, drawn from its motion values, with the
 * line from the card that opened it. It reports its natural size and is the
 * focusable, clickable part of the card; a drag on it pans the space.
 */
export function CardFrame({
  cardKey,
  label,
  values,
  parentValues,
  zIndex,
  expanded,
  focused,
  dimmed,
  surface,
  onMeasure,
  onElement,
  onActivate,
  onFocus,
  onContextMenu,
  onDoubleClick,
  onHover,
  children,
}: {
  readonly cardKey: string;
  readonly label: string;
  readonly values: CardValues;
  readonly parentValues: CardValues | undefined;
  readonly zIndex: number;
  readonly expanded: boolean;
  readonly focused: boolean;
  readonly dimmed: boolean;
  readonly surface: string;
  readonly onMeasure: (key: string, size: Size) => void;
  readonly onElement: (key: string, element: HTMLElement | null) => void;
  readonly onActivate: () => void;
  readonly onFocus: () => void;
  readonly onContextMenu?: (() => void) | undefined;
  readonly onDoubleClick?: (() => void) | undefined;
  readonly onHover?: ((hovering: boolean) => void) | undefined;
  readonly children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onMeasure, cardKey });
  latest.current = { onMeasure, cardKey };

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content === null) return;
    onMeasure(cardKey, {
      width: content.offsetWidth,
      height: content.offsetHeight,
    });
  });

  useEffect(() => {
    const content = contentRef.current;
    if (content === null) return;
    const observer = new ResizeObserver(() => {
      latest.current.onMeasure(latest.current.cardKey, {
        width: content.offsetWidth,
        height: content.offsetHeight,
      });
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onElement(cardKey, frameRef.current);
    return () => onElement(cardKey, null);
  }, [cardKey, onElement]);

  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ opacity: values.opacity, zIndex }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
    >
      {parentValues !== undefined && (
        <Connector from={parentValues} to={values} dimmed={dimmed} />
      )}
      <motion.div
        ref={frameRef}
        role="button"
        aria-label={label}
        aria-expanded={expanded}
        tabIndex={focused ? 0 : -1}
        onClick={onActivate}
        onDoubleClick={onDoubleClick}
        onFocus={onFocus}
        onContextMenu={
          onContextMenu === undefined
            ? undefined
            : (event) => {
                event.preventDefault();
                onContextMenu();
              }
        }
        onPointerEnter={onHover === undefined ? undefined : () => onHover(true)}
        onPointerLeave={
          onHover === undefined ? undefined : () => onHover(false)
        }
        style={{
          x: values.x,
          y: values.y,
          width: values.width,
          height: values.height,
        }}
        className={cn(
          'group/card absolute left-0 top-0 cursor-pointer select-none overflow-hidden rounded-xl bg-card text-card-foreground outline-none [--focus-accent:oklch(0.56_0.15_268)] dark:[--focus-accent:oklch(0.72_0.13_268)]',
          'shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.06)] ring-1 transition-[box-shadow,opacity,outline-color] duration-200',
          'hover:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_24px_-6px_rgb(0_0_0/0.12)]',
          surface,
          // The focused card: a calm accent outline that stays at least 2px
          // on screen at any zoom, and a little more lift.
          focused &&
            'outline-solid outline-offset-[calc(3px*var(--unzoom,1))] outline-(--focus-accent) [outline-width:calc(2px*var(--unzoom,1))] shadow-[0_2px_4px_rgb(0_0_0/0.06),0_14px_32px_-10px_rgb(0_0_0/0.22)] hover:shadow-[0_2px_4px_rgb(0_0_0/0.06),0_14px_32px_-10px_rgb(0_0_0/0.22)]',
          dimmed && 'opacity-35',
        )}
      >
        <div ref={contentRef} className="w-max">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Connector({
  from,
  to,
  dimmed,
}: {
  readonly from: CardValues;
  readonly to: CardValues;
  readonly dimmed: boolean;
}) {
  const path = useTransform(() => {
    const startX = from.x.get() + from.width.get();
    const startY = from.y.get() + from.height.get() / 2;
    const endX = to.x.get();
    const endY = to.y.get() + to.height.get() / 2;
    const bend = Math.max(24, (endX - startX) / 2);
    return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
  });
  return (
    <svg
      aria-hidden
      width="1"
      height="1"
      className={cn(
        'pointer-events-none absolute left-0 top-0 overflow-visible transition-opacity duration-200',
        dimmed && 'opacity-35',
      )}
    >
      <motion.path
        d={path}
        fill="none"
        stroke="color-mix(in oklab, var(--muted-foreground) 38%, transparent)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}
