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
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const from = value.get();
    if (reduced || from === amount) {
      value.set(amount);
      setMoving(false);
      return;
    }
    setMoving(true);
    const controls = animate(value, amount, {
      duration: 0.35,
      ease: 'easeOut',
      onComplete: () => setMoving(false),
    });
    return () => {
      controls.stop();
      setMoving(false);
    };
  }, [amount, reduced, value]);

  return (
    <motion.span
      className={cn(
        'transition-colors duration-500',
        moving && 'text-primary',
        className,
      )}
    >
      {text}
    </motion.span>
  );
}
