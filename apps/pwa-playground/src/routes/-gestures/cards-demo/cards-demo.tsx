import {
  type PanEnd,
  type SwipeEnd,
  useHold,
  usePan,
  useSwipe,
  useTap,
} from '@kstackz/ui-toolkit/components/blocks/gestures';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useEffect, useRef, useState } from 'react';

const CARDS = [
  { name: 'Ember', hue: 35 },
  { name: 'Moss', hue: 140 },
  { name: 'Tide', hue: 225 },
  { name: 'Iris', hue: 295 },
  { name: 'Coral', hue: 10 },
  { name: 'Sun', hue: 90 },
] as const;

type Tint = { readonly hue: number; readonly light: number };

const PLAIN: Tint = { hue: 0, light: 0 };

// How far a Swipe must go, or how fast, to turn to the next card.
const TURN_PX = 80;
const TURN_SPEED = 600;

// A Pan under the Hold tints the card: degrees of hue per px across, and
// lightness per px down.
const HUE_PER_PX = 0.5;
const LIGHT_PER_PX = -0.001;

const SPRING = { type: 'spring', stiffness: 380, damping: 32 } as const;

const LOG_SIZE = 5;

const clampLight = (light: number) => Math.max(-0.3, Math.min(0.2, light));

const colourOf = (hue: number, tint: Tint) =>
  `oklch(${(0.7 + clampLight(tint.light)).toFixed(3)} 0.14 ${Math.round(hue + tint.hue)})`;

const signed = (value: number, unit: string) =>
  `${value >= 0 ? '+' : ''}${Math.round(value)}${unit}`;

/**
 * A screen that reads one finger only, so the Hold starts the moment a
 * finger lands in the bottom-left corner. With no Hold, a Swipe turns
 * through a deck of colour cards and a Tap turns the card over. Under the
 * Hold, a Pan tints the card (across for hue, down for lightness) and a Tap
 * clears its tint. Every Gesture read shows in the log.
 */
export function CardsDemo() {
  const hold = useHold();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tints, setTints] = useState<ReadonlyArray<Tint>>(() =>
    CARDS.map(() => PLAIN),
  );
  const [log, setLog] = useState<ReadonlyArray<string>>([]);
  const face = useRef<HTMLDivElement>(null);
  const cardX = useMotionValue(0);
  const card = CARDS[index] ?? CARDS[0];
  const tint = tints[index] ?? PLAIN;

  const note = (line: string) =>
    setLog((lines) => [line, ...lines].slice(0, LOG_SIZE));

  useEffect(() => {
    note(hold ? 'Hold on' : 'Hold off');
  }, [hold]);

  const turn = (end: SwipeEnd) => {
    const step =
      end.distance <= -TURN_PX || end.velocity <= -TURN_SPEED
        ? 1
        : end.distance >= TURN_PX || end.velocity >= TURN_SPEED
          ? -1
          : 0;
    const next = index + step;
    if (end.interrupted || step === 0 || next < 0 || next >= CARDS.length) {
      note(end.interrupted ? 'Swipe interrupted' : 'Swipe · back');
      void animate(cardX, 0, { ...SPRING, velocity: end.velocity });
      return;
    }
    note(`Swipe · ${step > 0 ? 'next' : 'previous'} card`);
    setIndex(next);
    setFlipped(false);
    cardX.jump(-step * 120);
    void animate(cardX, 0, SPRING);
  };

  const swipe = useSwipe({ axis: 'x', onEnd: turn });
  useMotionValueEvent(swipe.dx, 'change', (value) => cardX.set(value));

  useTap({
    onTap: () => {
      note('Tap · turn over');
      setFlipped((was) => !was);
    },
  });

  const paint = (preview: Tint) => {
    if (face.current !== null) {
      face.current.style.background = colourOf(card.hue, preview);
    }
  };
  const tinting = (x: number, y: number): Tint => ({
    hue: tint.hue + x * HUE_PER_PX,
    light: clampLight(tint.light + y * LIGHT_PER_PX),
  });

  const pan = usePan({
    hold: true,
    onEnd: (end: PanEnd) => {
      // A Tap is also a Pan that did not move: the Tap says what it did.
      if (Math.hypot(end.x, end.y) < 1) return;
      if (end.interrupted) {
        paint(tint);
        note('Hold · Pan interrupted');
        return;
      }
      const next = tinting(end.x, end.y);
      setTints((all) => all.map((was, at) => (at === index ? next : was)));
      note(
        `Hold · Pan · hue ${signed(end.x * HUE_PER_PX, '°')}, light ${signed(end.y * LIGHT_PER_PX * 100, '%')}`,
      );
    },
  });
  const preview = () => paint(tinting(pan.x.get(), pan.y.get()));
  useMotionValueEvent(pan.x, 'change', preview);
  useMotionValueEvent(pan.y, 'change', preview);

  useTap({
    hold: true,
    onTap: () => {
      note('Hold · Tap · tint cleared');
      setTints((all) => all.map((was, at) => (at === index ? PLAIN : was)));
    },
  });

  const colour = colourOf(card.hue, tint);

  return (
    <section
      data-testid="cards-demo"
      className="flex h-full flex-col items-center gap-4 overflow-hidden p-4"
    >
      <p className="text-center text-xs text-balance text-muted-foreground">
        One finger only here, so the bottom-left corner starts the Hold the
        moment a finger lands on it.
      </p>
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center [perspective:900px]">
        <motion.div
          data-testid="card"
          data-flipped={flipped ? '' : undefined}
          style={{ x: cardX }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={SPRING}
          className={cn(
            'relative aspect-[3/4] w-3/5 max-w-64 rounded-2xl shadow-lg transition-shadow [transform-style:preserve-3d]',
            hold && 'ring-4 ring-foreground/60',
          )}
        >
          <div
            ref={face}
            className="absolute inset-0 flex flex-col justify-end rounded-2xl p-4 text-black/80 [backface-visibility:hidden]"
            style={{ background: colour }}
          >
            <span className="text-2xl font-semibold">{card.name}</span>
            <span className="text-xs">
              {index + 1} of {CARDS.length}
            </span>
          </div>
          <div className="absolute inset-0 flex flex-col justify-center gap-1 rounded-2xl border border-border bg-background p-4 font-mono text-xs [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <span className="font-sans text-base font-semibold">
              {card.name}
            </span>
            <span>{colour}</span>
            <span>
              tint {signed(tint.hue, '°')} · {signed(tint.light * 100, '%')}
            </span>
          </div>
        </motion.div>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {CARDS.map((each, at) => (
          <span
            key={each.name}
            className={cn(
              'size-1.5 rounded-full bg-muted-foreground/40 transition-colors',
              at === index && 'bg-foreground',
            )}
          />
        ))}
      </div>
      <dl className="grid w-full max-w-sm grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <dt className="font-medium text-foreground">No Hold</dt>
        <dd>Swipe across to turn cards · Tap to turn one over</dd>
        <dt className="font-medium text-foreground">Hold</dt>
        <dd>Pan to tint: across for hue, down for light · Tap to clear</dd>
      </dl>
      <ol
        data-testid="cards-log"
        className="h-24 w-full max-w-sm shrink-0 overflow-hidden rounded-lg border border-border px-3 py-2 font-mono text-[11px]"
      >
        {log.length === 0 && (
          <li className="text-muted-foreground">Gestures show here</li>
        )}
        {log.map((line, at) => (
          <li
            key={`${log.length - at}`}
            className={cn(at > 0 && 'text-muted-foreground')}
          >
            {line}
          </li>
        ))}
      </ol>
    </section>
  );
}
