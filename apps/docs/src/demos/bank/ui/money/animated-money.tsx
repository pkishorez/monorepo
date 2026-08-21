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
  const [delta, setDelta] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const from = value.get();
    if (reduced || from === amount) {
      value.set(amount);
      return;
    }
    setDelta(amount > from ? 'up' : 'down');
    const controls = animate(value, amount, {
      duration: 0.25,
      ease: 'easeOut',
      onComplete: () => setDelta(null),
    });
    return () => controls.stop();
  }, [amount, reduced, value]);

  return (
    <motion.span
      className={cn(
        'transition-colors duration-250',
        delta === 'up' && 'text-positive',
        delta === 'down' && 'text-destructive',
        className,
      )}
    >
      {text}
    </motion.span>
  );
}
