import type { ReactNode } from 'react';
import type { Package } from 'monoverse/schema';

import { ChevronLeft, Layers } from '#lib/lucide';
import { AnimatePresence, motion, useReducedMotion } from '#lib/motion';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

interface LaymosDrilldownProps {
  readonly monorepoName: string;
  // The Package open in Embedded Laymos; nothing is shown while undefined.
  readonly pkg: Package | undefined;
  readonly onExit: () => void;
  readonly renderContent: (pkg: Package) => ReactNode;
  readonly className?: string;
}

// Embedded Laymos: the full Laymos view of one Package's Project opened over
// the Monoverse canvas. The canvas beneath stays mounted, so closing returns
// to it exactly as it was left.
export function LaymosDrilldown({
  monorepoName,
  pkg,
  onExit,
  renderContent,
  className,
}: LaymosDrilldownProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const };

  return (
    <AnimatePresence>
      {pkg !== undefined && (
        <motion.div
          key={pkg.name}
          role="dialog"
          aria-label={`${pkg.name} in Laymos`}
          className={cn(
            'absolute inset-0 z-20 flex flex-col overflow-hidden bg-background',
            className,
          )}
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
          transition={transition}
        >
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
            <Button variant="ghost" size="sm" onClick={onExit}>
              <ChevronLeft />
              Back to {monorepoName}
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs font-semibold">
              <Layers className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{pkg.name}</span>
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {renderContent(pkg)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
