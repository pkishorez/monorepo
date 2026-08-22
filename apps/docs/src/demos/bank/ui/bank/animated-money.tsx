import { useEffect, useState } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/lib/utils';
import { formatMoney } from './money.ts';

const ROLL_MIN_S = 0.25;
const ROLL_MAX_S = 0.8;
const ROLL_PER_DECADE_S = 0.2;
const FLASH_HOLD_MS = 300;
const FLASH_FADE_MS = 300;

export function AnimatedMoney({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  const value = useMotionValue(amount);
  const text = useTransform(value, (raw) => formatMoney(Math.round(raw)));
  const reduced = useReducedMotion();
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const from = value.get();
    if (reduced || from === amount) {
      value.set(amount);
      setMoving(false);
      return;
    }
    setMoving(true);
    const duration = Math.min(
      ROLL_MAX_S,
      ROLL_MIN_S + Math.log10(Math.abs(amount - from)) * ROLL_PER_DECADE_S,
    );
    const controls = animate(value, amount, { duration, ease: 'easeOut' });
    const flash = setTimeout(
      () => setMoving(false),
      Math.max(FLASH_HOLD_MS, duration * 1000),
    );
    return () => {
      controls.stop();
      clearTimeout(flash);
      setMoving(false);
    };
  }, [amount, reduced, value]);

  return (
    <motion.span
      style={{ transitionDuration: `${FLASH_FADE_MS}ms` }}
      className={cn('transition-colors', moving && 'text-primary', className)}
    >
      {text}
    </motion.span>
  );
}
