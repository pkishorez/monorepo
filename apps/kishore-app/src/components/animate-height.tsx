import { cn } from '@monorepo/frontend/utils';
import { motion } from '@monorepo/frontend/motion';
import React, { useEffect, useRef, useState } from 'react';

interface AnimateChangeInHeightProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  alwaysIncreasing?: boolean;
}

export const AnimateHeight: React.FC<AnimateChangeInHeightProps> = ({
  children,
  className,
  duration = 0.3,
  alwaysIncreasing,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        // We only have one entry, so we can use entries[0].
        const observedHeight = entries[0].contentRect.height;
        setHeight((height) =>
          alwaysIncreasing
            ? Math.max(
                height === 'auto' ? observedHeight : height,
                observedHeight,
              )
            : observedHeight,
        );
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        // Cleanup the observer when the component is unmounted
        resizeObserver.disconnect();
      };
    }
  }, []);

  return (
    <motion.div
      className={cn(className, 'overflow-hidden')}
      initial={{ height: 'auto' }}
      animate={{ height }}
      transition={{ duration, ease: 'easeOut' }}
    >
      <div ref={containerRef}>{children}</div>
    </motion.div>
  );
};
